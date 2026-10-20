/**
 * Shared document preview dialog. The signed storage URL is cross-origin and
 * our CSP intentionally allows only 'self' and blob: frames, so PDFs are
 * fetched and framed as a blob: URL instead of widening the policy.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentModal } from "@/components/shared/document-modal";
import { FileText, Download, X, Loader2 } from "lucide-react";

function inferKind(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  return "other";
}

export function PreviewDialog({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const kind = inferKind(name);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "pdf") return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load the file (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message ?? "Could not load this file for preview.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, kind]);

  return (
    <DocumentModal title={name} onClose={onClose} className="tvp-preview-modal">
      <div className="tvp-preview-header">
        <div className="tvp-preview-name">
          <FileText className="h-4 w-4 text-[var(--tvp-muted)]" />
          <strong className="tvp-preview-filename">{name}</strong>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="tvp-secondary">
            <a href={url} target="_blank" rel="noopener" download={name}>
              <Download className="h-4 w-4" />
              Download
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="tvp-mini-btn"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="tvp-preview-body">
        {kind === "pdf" &&
          (loadError ? (
            <div className="tvp-preview-empty">
              <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
              <h3 className="tvp-h2">Preview unavailable</h3>
              <p className="tvp-muted tvp-preview-error">{loadError}</p>
              <Button asChild className="tvp-primary">
                <a href={url} target="_blank" rel="noopener" download={name}>
                  <Download className="h-4 w-4" />
                  Download instead
                </a>
              </Button>
            </div>
          ) : !blobUrl ? (
            <div className="tvp-muted tvp-preview-loading">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Loading preview…
            </div>
          ) : (
            <iframe src={blobUrl} title={name} className="tvp-preview-frame" />
          ))}
        {kind === "image" && <img src={url} alt={name} className="tvp-preview-image" />}
        {kind === "other" && (
          <div className="tvp-preview-empty">
            <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
            <h3 className="tvp-h2">Preview not available</h3>
            <p className="tvp-muted tvp-preview-error">
              This file type can't be rendered inline in the browser.
            </p>
            <Button asChild className="tvp-primary">
              <a href={url} target="_blank" rel="noopener" download={name}>
                <Download className="h-4 w-4" />
                Download to open
              </a>
            </Button>
          </div>
        )}
      </div>
    </DocumentModal>
  );
}

export default PreviewDialog;
