import { SHARE_RECIPIENT_TERM, SHARE_RECIPIENT_TERM_CAPITALISED } from "@/lib/terms";
import { TalVaultLockup } from "@/components/brand/talvault-logo";
import { ModalShell } from "@/components/shared/modal-shell";
import { DocumentModal } from "@/components/shared/document-modal";
import { fileKind } from "@/components/shared/brand";
import { fmtDate, fmtDateTime } from "@/lib/display-dates";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  Download,
  Folder,
  FileText,
  Lock,
  Eye,
  KeyRound,
  X,
  Hourglass,
  Ban,
  SearchX,
  ShieldAlert,
  FileWarning,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getLovedOneShareByToken,
  getLovedOneFileUrl,
  unlockLovedOneShare,
} from "@/lib/loved-one.functions";
import {
  BillingDocument,
  type BillingDocAgency,
  type BillingDocRecord,
} from "@/components/agency/billing-document";
import type { BillingLine } from "@/lib/billing";
import { friendlyError } from "@/lib/friendly-error";

/** A shared quote or invoice, as returned for a billing share. */
type SharedBilling = { doc: SharedBillingDoc; lines: BillingLine[]; agency: BillingDocAgency };
/** A shared document's listing fields, as returned by the share loader. */
type SharedDoc = {
  id: string;
  name: string;
  folder_id: string | null;
  size_bytes: number | null;
  mime_type?: string | null;
  created_at: string;
};
type SharedFolder = { id: string; name: string };
type SharedBillingDoc = BillingDocRecord & { id: string };
/** What the page reads from each getLovedOneShareByToken outcome. */
type ShareState =
  | { status: "loading" }
  | { status: "error"; error?: string }
  | { status: "not_found" }
  | { status: "expired"; sharer?: { full_name: string } | null }
  | { status: "revoked"; sharer?: { full_name: string } | null }
  | { status: "locked"; sharer?: { full_name: string } | null }
  | {
      status: "code_required";
      sharer?: { full_name: string } | null;
      share?: { loved_one_name: string | null };
    }
  | {
      status: "ok";
      sharer: { full_name: string };
      share: {
        loved_one_name: string | null;
        loved_one_email: string | null;
        expires_at: string;
        note: string | null;
        permission: "view" | "download";
        share_kind: "folders" | "document" | "billing";
      };
      folders: SharedFolder[];
      documents: SharedDoc[];
      billing: SharedBilling[];
    };

/** Read-only rendering of a shared quote or invoice — data, not a file. */
function BillingBlock({
  record,
  watermarked,
  watermark,
}: {
  record: SharedBilling;
  watermarked: boolean;
  watermark: string;
}) {
  const tiles = Array.from({ length: 18 });
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        marginBottom: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        <BillingDocument doc={record.doc} lines={record.lines} agency={record.agency} />
        {watermarked && (
          <div
            data-testid="lo-billing-watermark"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              alignContent: "space-around",
              gap: 12,
            }}
          >
            {tiles.map((_, i) => (
              <span
                key={i}
                style={{
                  transform: "rotate(-28deg)",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "color-mix(in oklab, var(--teal) 18%, transparent)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {watermark}
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--line)",
          fontSize: 12,
          color: "var(--ink-500)",
        }}
      >
        {watermarked
          ? "View only. Watermarked with your email and the time you opened it."
          : "Shared with you for your records."}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/loved-one/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${SHARE_RECIPIENT_TERM_CAPITALISED} access · TalVault` },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: `${SHARE_RECIPIENT_TERM_CAPITALISED} access · TalVault` },
      {
        property: "og:description",
        content: `Secure, time-limited access to documents shared with you as a ${SHARE_RECIPIENT_TERM} via TalVault.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: `Secure, time-limited access to documents shared with you as a ${SHARE_RECIPIENT_TERM} via TalVault.`,
      },
    ],
  }),
  component: LovedOnePage,
});

const ticketKey = (token: string) => `tvp-lo-ticket-${token}`;

const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "";

/** "PDF", "JPG", "DOCX" … from the file name. */
function typeLabel(name: string) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext.toUpperCase() : "File";
}

/** Plural description of a type the browser can't show, for the explanation. */
function unviewableTypeName(name: string) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "Word documents";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "spreadsheets";
  if (["ppt", "pptx", "odp"].includes(ext)) return "presentations";
  return "files of this type";
}

function fmtSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LovedOnePage() {
  const { token } = Route.useParams();
  const load = useServerFn(getLovedOneShareByToken);
  const fileUrl = useServerFn(getLovedOneFileUrl);
  const unlock = useServerFn(unlockLovedOneShare);

  const [state, setState] = useState<ShareState>({ status: "loading" });
  const [ticket, setTicket] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return sessionStorage.getItem(ticketKey(token)) ?? undefined;
  });
  const [viewer, setViewer] = useState<{ url: string; name: string; openedAt: Date } | null>(
    null,
  );
  const [unviewable, setUnviewable] = useState<string | null>(null);

  const refresh = useCallback(
    (t?: string) => {
      load({ data: { token, ticket: t } })
        .then(setState)
        .catch((e: unknown) => setState({ status: "error", error: friendlyError(e) }));
    },
    [load, token],
  );

  // Initial load only — unlocking calls refresh() explicitly with a new ticket.
  const initialTicket = useRef(ticket);
  useEffect(() => {
    refresh(initialTicket.current);
  }, [refresh]);

  async function onUnlock(code: string) {
    const res = await unlock({ data: { token, code } });
    if (res.ok) {
      sessionStorage.setItem(ticketKey(token), res.ticket);
      setTicket(res.ticket);
      refresh(res.ticket);
      return { ok: true as const };
    }
    return { ok: false as const, reason: res.reason, remaining: res.remaining };
  }

  async function openDoc(docId: string, mode: "view" | "download") {
    try {
      const res = await fileUrl({ data: { token, ticket, document_id: docId, mode } });
      if (!res.url) {
        setUnviewable(res.name);
        return;
      }
      if (mode === "download") window.open(res.url, "_blank", "noopener");
      else if (!res.previewable) setUnviewable(res.name);
      else setViewer({ url: res.url, name: res.name, openedAt: new Date() });
    } catch (e) {
      toast.error(friendlyError(e, "We couldn’t open this document. Please try again."));
    }
  }

  const sharerFull =
    "sharer" in state && state.sharer?.full_name ? state.sharer.full_name : "The person";
  const sharerShort = firstName(sharerFull) || sharerFull;

  if (state.status === "loading")
    return (
      <Shell>
        <div className="tvl-card tvl-center" role="status">
          <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> Loading…
        </div>
      </Shell>
    );
  if (state.status === "not_found" || state.status === "error")
    return (
      <Shell>
        <StateCard
          icon={<SearchX />}
          tone="neutral"
          title="We can’t find this link"
          body="Check the link in your email, or ask the person who shared it to send it again."
        />
      </Shell>
    );
  if (state.status === "expired")
    return (
      <Shell>
        <StateCard
          icon={<Hourglass />}
          tone="neutral"
          title="This link has expired"
          body={`Ask ${sharerShort} to share the documents with you again.`}
        />
      </Shell>
    );
  if (state.status === "revoked")
    return (
      <Shell>
        <StateCard
          icon={<Ban />}
          tone="neutral"
          title={`${sharerShort} stopped sharing`}
          body={`These documents are no longer shared with you. If you still need them, contact ${sharerShort}.`}
        />
      </Shell>
    );
  if (state.status === "locked")
    return (
      <Shell>
        <StateCard
          icon={<ShieldAlert />}
          tone="red"
          title="This link is locked"
          body={`Too many incorrect codes were entered. Ask ${sharerShort} for a new access code.`}
        />
      </Shell>
    );

  if (state.status === "code_required") {
    return (
      <Shell>
        <CodeGate sharerName={sharerShort} onUnlock={onUnlock} />
      </Shell>
    );
  }

  const share = state.share;
  const canDownload = share.permission === "download";
  const isBilling = share.share_kind === "billing";
  const billing: SharedBilling[] = state.billing ?? [];
  const folders: SharedFolder[] = state.folders ?? [];
  const documents: SharedDoc[] = state.documents ?? [];
  const byFolder = new Map<string | null, SharedDoc[]>();
  for (const d of documents) {
    const k = d.folder_id ?? null;
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(d);
  }
  const who = share.loved_one_email ?? share.loved_one_name ?? "";

  return (
    <Shell>
      <section className="tvl-intro">
        <h1 className="tvl-h1">Hi {share.loved_one_name ?? "there"}</h1>
        <p className="tvl-lead">
          {sharerShort} shared {isBilling ? "these quotes and invoices" : "these documents"} with
          you so you can find them when you need them.
        </p>
        <div className="tvl-pills">
          <span className="tvl-pill tvl-pill-neutral">
            <Clock className="h-3.5 w-3.5" aria-hidden /> Access ends {fmtDateTime(share.expires_at)}
          </span>
          {canDownload ? (
            <span className="tvl-pill tvl-pill-teal">
              <Download className="h-3.5 w-3.5" aria-hidden /> Downloads allowed
            </span>
          ) : (
            <span className="tvl-pill tvl-pill-teal">
              <Eye className="h-3.5 w-3.5" aria-hidden /> View only
            </span>
          )}
        </div>
        {share.note && <p className="tvl-note">{share.note}</p>}
      </section>

      {isBilling ? (
        <>
          {billing.map((b) => (
            <BillingBlock
              key={b.doc.id}
              record={b}
              watermarked={!canDownload}
              watermark={`${who} · ${fmtDateTime(new Date())}`}
            />
          ))}
          {billing.length === 0 && (
            <StateCard
              icon={<FileText />}
              tone="teal"
              title="Nothing shared yet"
              body="No quotes or invoices have been shared yet. Check back later."
            />
          )}
        </>
      ) : (
        <>
          {folders.map((f) => (
            <FolderBlock
              key={f.id}
              name={f.name}
              docs={byFolder.get(f.id) ?? []}
              canDownload={canDownload}
              onOpen={openDoc}
            />
          ))}
          {(byFolder.get(null)?.length ?? 0) > 0 && (
            <FolderBlock
              name={share.share_kind === "document" ? "Shared document" : "More documents"}
              docs={byFolder.get(null)!}
              canDownload={canDownload}
              onOpen={openDoc}
            />
          )}
          {documents.length === 0 && (
            <StateCard
              icon={<Folder />}
              tone="teal"
              title="Nothing shared yet"
              body="Nothing has been shared with you yet. Check back once documents are added."
            />
          )}
        </>
      )}

      {viewer && (
        <WatermarkedViewer
          url={viewer.url}
          name={viewer.name}
          watermark={`${who} · ${fmtDateTime(viewer.openedAt)}`}
          onClose={() => setViewer(null)}
        />
      )}

      {unviewable && (
        <ModalShell onClose={() => setUnviewable(null)} maxWidth={480} labelledBy="tvl-nv-title">
          <div className="tvp-modal-head">
            <h2 className="tvp-h2" id="tvl-nv-title">
              <FileWarning className="h-4 w-4" aria-hidden /> {unviewable}
            </h2>
            <button
              type="button"
              className="tvp-mini-btn"
              aria-label="Close"
              title="Close"
              onClick={() => setUnviewable(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="tvp-modal-body">
            <h3 className="tvl-h3">This file can’t be previewed</h3>
            <p className="tvp-muted">
              {sharerShort} shared it as view only, and {unviewableTypeName(unviewable)} can’t be
              shown in the browser. Ask {sharerShort} to share a PDF copy, or to allow downloads.
            </p>
          </div>
          <div className="tvp-modal-foot">
            <button type="button" className="tvp-secondary" onClick={() => setUnviewable(null)}>
              Close
            </button>
          </div>
        </ModalShell>
      )}
    </Shell>
  );
}

function CodeGate({
  sharerName,
  onUnlock,
}: {
  sharerName: string;
  onUnlock: (code: string) => Promise<{ ok: boolean; reason?: string; remaining?: number }>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await onUnlock(code);
      if (!res.ok) {
        setErr(
          res.reason === "locked"
            ? `Too many incorrect codes. This link is now locked. Ask ${sharerName} for a new access code.`
            : res.reason === "throttled"
              ? "Too many tries from this device. Wait a few minutes, then try again."
              : res.reason === "bad_code"
                ? `That code isn’t right.${res.remaining != null ? ` You have ${res.remaining} ${res.remaining === 1 ? "try" : "tries"} left.` : ""}`
                : `This link can’t be opened right now. Ask ${sharerName} to share it again.`,
        );
      }
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tvl-card tvl-gate" onSubmit={submit} noValidate>
      <span className="tvl-tile tvl-tile-teal" aria-hidden>
        <KeyRound />
      </span>
      <h1 className="tvl-h2">{sharerName} shared documents with you</h1>
      <p className="tvl-lead">
        For your security, this link alone can’t open them. Enter the access code {sharerName} gave
        you.
      </p>
      <div className="tvl-field">
        <label htmlFor="tvl-code">Access code</label>
        <input
          id="tvl-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby="tvl-code-hint"
          aria-invalid={err ? true : undefined}
          aria-errormessage={err ? "tvl-code-error" : undefined}
          autoFocus
        />
        <span id="tvl-code-hint" className="tvl-hint">
          Codes are never sent by email. If you don’t have one, ask {sharerName}.
        </span>
        {err && (
          <span id="tvl-code-error" className="tvl-error" role="alert">
            {err}
          </span>
        )}
      </div>
      <button type="submit" className="tvl-btn tvl-btn-primary tvl-btn-lg" disabled={busy || code.trim().length < 4}>
        <Lock className="h-4 w-4" aria-hidden /> {busy ? "Checking…" : "Unlock documents"}
      </button>
    </form>
  );
}

/**
 * View-only document viewer. The file route can't be framed directly (the
 * site sends X-Frame-Options: DENY), so the file is fetched and framed as a
 * blob: URL — the same approach as the vault preview.
 */
function WatermarkedViewer({
  url,
  name,
  watermark,
  onClose,
}: {
  url: string;
  name: string;
  watermark: string;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<{ url: string; type: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`load ${res.status}`);
        const b = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob({ url: objectUrl, type: b.type });
      } catch {
        if (!cancelled) setLoadError("We couldn’t load this document. Close it and try again.");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  const tiles = Array.from({ length: 24 });
  const isImage = blob?.type.startsWith("image/");
  return (
    <DocumentModal title={name} onClose={onClose} className="tvp-preview-modal">
      <div className="tvp-preview-header">
        <div className="tvp-preview-name">
          <FileText className="h-4 w-4" aria-hidden />
          <strong className="tvp-preview-filename">{name}</strong>
          <span className="tvl-pill tvl-pill-teal">
            <Eye className="h-3.5 w-3.5" aria-hidden /> View only
          </span>
        </div>
        <button
          type="button"
          className="tvp-mini-btn"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="tvp-preview-body" style={{ position: "relative" }}>
        {loadError ? (
          <div className="tvp-preview-empty">
            <p className="tvp-muted">{loadError}</p>
          </div>
        ) : !blob ? (
          <div className="tvp-muted tvp-preview-loading" role="status">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Loading…
          </div>
        ) : isImage ? (
          <img src={blob.url} alt={name} className="tvp-preview-image" />
        ) : (
          <iframe src={blob.url} title={name} className="tvp-preview-frame" />
        )}
        {/* Traceability watermark — overlaid, non-interactive, cannot be switched off. */}
        <div data-testid="lo-watermark" aria-hidden className="tvl-watermark">
          {tiles.map((_, i) => (
            <span key={i}>{watermark}</span>
          ))}
        </div>
      </div>
      <div className="tvl-viewer-foot">Watermarked with your email and the time you opened it.</div>
    </DocumentModal>
  );
}

function FolderBlock({
  name,
  docs,
  canDownload,
  onOpen,
}: {
  name: string;
  docs: SharedDoc[];
  canDownload: boolean;
  onOpen: (id: string, mode: "view" | "download") => void;
}) {
  return (
    <section className="tvl-card tvl-folder">
      <header className="tvl-folder-head">
        <span className="tvl-tile tvl-tile-teal tvl-tile-sm" aria-hidden>
          <Folder />
        </span>
        <h2 className="tvl-h3">{name}</h2>
        <span className="tvl-muted">
          {docs.length} {docs.length === 1 ? "document" : "documents"}
        </span>
      </header>
      {docs.length === 0 ? (
        <p className="tvl-muted">No documents in this folder.</p>
      ) : (
        <ul className="tvl-docs">
          {docs.map((d) => {
            const k = fileKind(d.name);
            const meta = [typeLabel(d.name), fmtSize(d.size_bytes), fmtDate(d.created_at, "")]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={d.id} className="tvl-doc">
                <span className={`tvl-tile tvl-tile-sm tvl-tile-${k.tone}`} title={k.label}>
                  <k.Icon aria-label={k.label} />
                </span>
                <div className="tvl-doc-text">
                  <span className="tvl-doc-name">{d.name}</span>
                  <span className="tvl-muted">{meta}</span>
                </div>
                <div className="tvl-doc-actions">
                  <button
                    type="button"
                    className="tvl-btn tvl-btn-secondary"
                    onClick={() => onOpen(d.id, "view")}
                    aria-label={`View ${d.name}`}
                  >
                    <Eye className="h-4 w-4" aria-hidden /> View
                  </button>
                  {canDownload && (
                    <button
                      type="button"
                      className="tvl-btn tvl-btn-secondary"
                      onClick={() => onOpen(d.id, "download")}
                      aria-label={`Download ${d.name}`}
                    >
                      <Download className="h-4 w-4" aria-hidden /> Download
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StateCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "teal" | "neutral" | "red";
  title: string;
  body: string;
}) {
  return (
    <div className="tvl-card tvl-state">
      <span className={`tvl-tile tvl-tile-${tone}`} aria-hidden>
        {icon}
      </span>
      <h1 className="tvl-h2">{title}</h1>
      <p className="tvl-lead">{body}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tvl">
      <header className="tvl-bar">
        <div className="tvl-bar-inner">
          <TalVaultLockup variant="teal" className="tvl-logo tvl-logo-light" style={{ height: 28 }} />
          <TalVaultLockup variant="white" className="tvl-logo tvl-logo-dark" style={{ height: 28 }} />
          <span className="tvl-pill tvl-pill-teal">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Secure shared documents
          </span>
        </div>
      </header>
      <main className="tvl-main">
        <span className="sr-only">
          {SHARE_RECIPIENT_TERM_CAPITALISED} access for a {SHARE_RECIPIENT_TERM}
        </span>
        {children}
      </main>
      <footer className="tvl-foot">
        Access is time-limited. The person who shared these can stop sharing at any time.
      </footer>
    </div>
  );
}
