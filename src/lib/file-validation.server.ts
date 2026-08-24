/**
 * Server-side upload validation (TVA-SEC-004).
 *
 * Uploads go browser -> storage directly (signed URL or bucket RLS), so the
 * client controls the declared name, MIME type and size. None of that is
 * trustworthy. This module re-derives the truth from the stored bytes:
 *
 *   1. Range-fetch the first 4 KB of the stored object via a short-lived signed
 *      URL. The `Content-Range` response header gives the authoritative size.
 *   2. Sniff the file signature (magic bytes) to derive the real type.
 *   3. Reject anything not on the allow-list, anything whose real type
 *      contradicts the client's claimed MIME, and anything over the limit.
 *   4. On rejection, delete the orphaned object so nothing unvalidated is left
 *      sitting in the bucket.
 *
 * NOT covered here: malware/AV scanning. Detecting a malicious-but-well-formed
 * PDF or Office macro needs a third-party scanning service (e.g. ClamAV as a
 * sidecar, VirusTotal, Cloudflare/Google/AWS content scanning). That is a
 * vendor decision and a running cost, so it is deliberately left as a
 * follow-up rather than hand-rolled here. Quarantine (upload to a holding
 * bucket, promote only after a clean scan) should be designed together with
 * whichever vendor is chosen.
 */

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "./file-validation";

export { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES };

/** How many leading bytes we inspect. Enough for every signature below. */
const SNIFF_BYTES = 4096;

export type DetectedKind =
  | "pdf"
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "heic"
  | "tiff"
  | "zip" /* also docx/xlsx/pptx — OOXML is a zip container */
  | "ole" /* legacy doc/xls/ppt */
  | "rtf"
  | "text";

type Signature = {
  kind: DetectedKind;
  offset: number;
  bytes: number[];
};

/**
 * Ordered longest-first so a more specific signature wins. `-1` in `bytes`
 * means "any byte" (wildcard), used for RIFF/ISO-BMFF containers.
 */
const SIGNATURES: Signature[] = [
  { kind: "png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "ole", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  // RIFF ???? WEBP
  { kind: "webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50] },
  // ???? ftyp heic / heix / hevc / mif1
  { kind: "heic", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69] },
  { kind: "heic", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31] },
  { kind: "gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { kind: "gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { kind: "rtf", offset: 0, bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] },
  { kind: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { kind: "tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { kind: "tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { kind: "zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { kind: "zip", offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { kind: "zip", offset: 0, bytes: [0x50, 0x4b, 0x07, 0x08] },
  { kind: "jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
];

/** Kinds acceptable in the document buckets. */
const DOCUMENT_KINDS: ReadonlySet<DetectedKind> = new Set<DetectedKind>([
  "pdf", "jpeg", "png", "gif", "webp", "heic", "tiff", "zip", "ole", "rtf", "text",
]);

/** Kinds acceptable for the agency logo. Raster only — SVG is never allowed. */
const IMAGE_KINDS: ReadonlySet<DetectedKind> = new Set<DetectedKind>([
  "jpeg", "png", "gif", "webp",
]);

/**
 * Which detected kinds are consistent with a claimed MIME type. A client that
 * claims `application/pdf` must actually have shipped a PDF.
 */
const MIME_EXPECTATIONS: { test: RegExp; kinds: DetectedKind[] }[] = [
  { test: /^application\/pdf$/i, kinds: ["pdf"] },
  { test: /^image\/jpe?g$/i, kinds: ["jpeg"] },
  { test: /^image\/png$/i, kinds: ["png"] },
  { test: /^image\/gif$/i, kinds: ["gif"] },
  { test: /^image\/webp$/i, kinds: ["webp"] },
  { test: /^image\/hei[cf]$/i, kinds: ["heic"] },
  { test: /^image\/tiff$/i, kinds: ["tiff"] },
  // OOXML documents are zip containers.
  { test: /^application\/vnd\.openxmlformats-officedocument\./i, kinds: ["zip"] },
  { test: /^application\/zip$/i, kinds: ["zip"] },
  // Legacy Office is an OLE compound file.
  { test: /^application\/vnd\.ms-(word|excel|powerpoint)$/i, kinds: ["ole"] },
  { test: /^application\/msword$/i, kinds: ["ole", "rtf"] },
  { test: /^application\/rtf$/i, kinds: ["rtf"] },
  { test: /^text\//i, kinds: ["text"] },
];

function matches(head: Uint8Array, sig: Signature): boolean {
  if (head.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    const expected = sig.bytes[i];
    if (expected === -1) continue;
    if (head[sig.offset + i] !== expected) return false;
  }
  return true;
}

/**
 * Does this look like plain text (txt/csv)? Only called when no binary
 * signature matched. Rejects control characters and NUL bytes, which is what
 * separates a genuine CSV from a renamed executable.
 */
function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  for (const b of head) {
    const printable =
      b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80;
    if (!printable) return false;
  }
  return true;
}

export function detectKind(head: Uint8Array): DetectedKind | null {
  for (const sig of SIGNATURES) {
    if (matches(head, sig)) return sig.kind;
  }
  return looksLikeText(head) ? "text" : null;
}

export class UploadRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UploadRejected";
  }
}

export type ValidateOptions = {
  bucket: string;
  path: string;
  /** MIME type the client claimed. Optional — when absent we only allow-list. */
  claimedMime?: string | null;
  /** "document" (50 MB, broad types) or "image" (2 MB, raster images only). */
  profile?: "document" | "image";
  /** Delete the stored object when validation fails. Default true. */
  removeOnFailure?: boolean;
};

export type ValidateResult = {
  kind: DetectedKind;
  sizeBytes: number;
};

/**
 * Authoritative post-upload check. Throws `UploadRejected` on any violation
 * after cleaning up the offending object.
 */
export async function validateStoredUpload(opts: ValidateOptions): Promise<ValidateResult> {
  const profile = opts.profile ?? "document";
  const maxBytes = profile === "image" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  const allowed = profile === "image" ? IMAGE_KINDS : DOCUMENT_KINDS;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const fail = async (code: string, message: string): Promise<never> => {
    if (opts.removeOnFailure !== false) {
      try {
        await supabaseAdmin.storage.from(opts.bucket).remove([opts.path]);
      } catch (e) {
        console.error("[upload-validation] cleanup failed", opts.bucket, opts.path, e);
      }
    }
    throw new UploadRejected(code, message);
  };

  const { data: signed, error: sErr } = await supabaseAdmin.storage
    .from(opts.bucket)
    .createSignedUrl(opts.path, 60);
  if (sErr || !signed?.signedUrl) {
    return fail("UPLOAD_MISSING", "The uploaded file could not be read back for checking.");
  }

  const res = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
  });
  if (!res.ok && res.status !== 206) {
    return fail("UPLOAD_MISSING", "The uploaded file could not be read back for checking.");
  }

  // Authoritative size: "bytes 0-4095/123456" -> 123456. Falls back to
  // Content-Length when the range was not honoured (small files).
  let sizeBytes = Number(res.headers.get("content-length") ?? 0);
  const contentRange = res.headers.get("content-range");
  const total = contentRange?.split("/")?.[1];
  if (total && total !== "*" && Number.isFinite(Number(total))) sizeBytes = Number(total);

  const head = new Uint8Array(await res.arrayBuffer());

  if (sizeBytes === 0 || head.length === 0) {
    return fail("UPLOAD_EMPTY", "That file is empty.");
  }
  if (sizeBytes > maxBytes) {
    return fail(
      "UPLOAD_TOO_LARGE",
      `That file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
    );
  }

  const kind = detectKind(head);
  if (!kind || !allowed.has(kind)) {
    return fail(
      "UPLOAD_TYPE_NOT_ALLOWED",
      profile === "image"
        ? "That file is not a supported image. Use a JPEG, PNG, WebP or GIF."
        : "That file type is not supported. Upload a PDF, image, Office document or plain text file.",
    );
  }

  const claimed = (opts.claimedMime ?? "").trim();
  if (claimed) {
    const expectation = MIME_EXPECTATIONS.find((m) => m.test.test(claimed));
    if (expectation && !expectation.kinds.includes(kind)) {
      return fail(
        "UPLOAD_TYPE_MISMATCH",
        "The file's contents do not match its stated type. Re-save the file and try again.",
      );
    }
  }

  return { kind, sizeBytes };
}
