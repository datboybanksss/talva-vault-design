/**
 * Shared document preview dialog. The signed storage URL is cross-origin and
 * our CSP intentionally allows only 'self' and blob: frames, so PDFs are
 * fetched and framed as a blob: URL instead of widening the policy.
 */

import { useEffect, useState } from "react";
import { FileText, Download, X, Loader2 } from "lucide-react";

function inferKind(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  return "other";
}

export function PreviewDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
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
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tvp-card"
        style={{ width: "min(1100px, 100%)", height: "min(85vh, 900px)", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--tvp-border, #e5e7eb)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <FileText className="h-4 w-4 text-[var(--tvp-muted)]" />
            <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          </div>
          <div className="flex gap-2">
            <a className="tvp-secondary" href={url} target="_blank" rel="noopener" download={name}>
              <Download className="h-4 w-4" />Download
            </a>
            <button className="tvp-mini-btn" title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, background: "#0f172a08", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {kind === "pdf" && (
            loadError ? (
              <div style={{ textAlign: "center", padding: 32 }}>
                <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
                <h3 className="tvp-h2">Preview unavailable</h3>
                <p className="tvp-muted" style={{ marginTop: 6, marginBottom: 16 }}>{loadError}</p>
                <a className="tvp-primary" href={url} target="_blank" rel="noopener" download={name}>
                  <Download className="h-4 w-4" />Download instead
                </a>
              </div>
            ) : !blobUrl ? (
              <div className="tvp-muted" style={{ display: "flex", alignItems: "center", gap: 8, padding: 32 }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
              </div>
            ) : (
              <iframe src={blobUrl} title={name} style={{ width: "100%", height: "100%", border: 0, background: "white" }} />
            )
          )}
          {kind === "image" && (
            <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          )}
          {kind === "other" && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
              <h3 className="tvp-h2">Preview not available</h3>
              <p className="tvp-muted" style={{ marginTop: 6, marginBottom: 16 }}>
                This file type can't be rendered inline in the browser.
              </p>
              <a className="tvp-primary" href={url} target="_blank" rel="noopener" download={name}>
                <Download className="h-4 w-4" />Download to open
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PreviewDialog;
