/** Server-derived file types; client declarations never decide response headers. */
export const KIND_MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  tiff: "image/tiff",
  zip: "application/zip",
  ole: "application/octet-stream",
  rtf: "application/rtf",
  text: "text/plain; charset=utf-8",
} as const;

const CLAIMS: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpeg"],
  "image/jpg": ["jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heic"],
  "image/tiff": ["tiff"],
  "application/zip": ["zip"],
  "application/x-zip-compressed": ["zip"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["zip"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["zip"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["zip"],
  "application/msword": ["ole", "rtf"],
  "application/vnd.ms-word": ["ole"],
  "application/vnd.ms-excel": ["ole"],
  "application/vnd.ms-powerpoint": ["ole"],
  "application/rtf": ["rtf"],
  "text/rtf": ["rtf"],
  "text/plain": ["text"],
  "text/csv": ["text"],
  "application/octet-stream": Object.keys(KIND_MIME),
};
export function allowedMimeClaim(claim?: string | null): boolean {
  return !claim?.trim() || Object.hasOwn(CLAIMS, claim.trim().toLowerCase().split(";")[0]);
}
export function mimeClaimMatches(
  claim: string | null | undefined,
  kind: keyof typeof KIND_MIME,
): boolean {
  if (!claim?.trim()) return true;
  return CLAIMS[claim.trim().toLowerCase().split(";")[0]]?.includes(kind) === true;
}
export function documentIsValidated(doc: { validated_at?: string | null }): boolean {
  return typeof doc.validated_at === "string" && Number.isFinite(Date.parse(doc.validated_at));
}
const INLINE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];

/** Server-trusted MIME for a stored claim; unknown claims become octet-stream. */
export function servedMimeType(mime: string | null | undefined): string {
  return Object.values(KIND_MIME).includes(mime as (typeof KIND_MIME)[keyof typeof KIND_MIME])
    ? String(mime)
    : "application/octet-stream";
}

/** True when the browser can show this file inline (PDF and common images). */
export function isInlineViewable(mime: string | null | undefined): boolean {
  return INLINE_TYPES.includes(servedMimeType(mime));
}

export function fileResponseHeaders(
  mime: string | null | undefined,
  name: string,
  download = false,
): Headers {
  const type = servedMimeType(mime);
  const inline = !download && INLINE_TYPES.includes(type);
  return new Headers({
    "Content-Type": type,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/["\\\r\n]/g, "_").replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    // `sandbox` stops Chrome rendering PDFs, so inline PDF/image views omit
    // it; every other response (attachments, other types) keeps it.
    "Content-Security-Policy": inline
      ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
      : "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
  });
}
