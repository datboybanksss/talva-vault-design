/**
 * Client-safe upload constraints (TVA-SEC-004).
 *
 * These constants drive the file picker's `accept` attribute and the friendly
 * pre-flight message in the UI. They are a convenience only — the authoritative
 * check runs server-side in `file-validation.server.ts`, which sniffs the real
 * file signature after the bytes land in storage. Never rely on this module for
 * security; a client can bypass all of it.
 */

/** Document buckets: talent-documents, talent-private-documents, agency-compliance-docs. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB
/** Image-only bucket: agency-branding (logos). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip";

export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cheap pre-flight so the user gets instant feedback instead of uploading 40 MB
 * and being rejected. Returns an error string, or null when the file looks fine.
 */
export function preflightUpload(
  file: { name: string; size: number },
  maxBytes: number = MAX_DOCUMENT_BYTES,
): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}
