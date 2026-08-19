import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Clock, Download, Folder, FileText, AlertTriangle, Lock, Eye, KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { getLovedOneShareByToken, getLovedOneFileUrl, unlockLovedOneShare } from "@/lib/loved-one.functions";

export const Route = createFileRoute("/loved-one/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Loved-One Access · TalVault" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Time-bound access to documents shared with you via TalVault." },
    ],
  }),
  component: LovedOnePage,
});

const ticketKey = (token: string) => `tvp-lo-ticket-${token}`;

function LovedOnePage() {
  const { token } = Route.useParams();
  const load = useServerFn(getLovedOneShareByToken);
  const fileUrl = useServerFn(getLovedOneFileUrl);
  const unlock = useServerFn(unlockLovedOneShare);

  const [state, setState] = useState<any>({ status: "loading" });
  const [ticket, setTicket] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return sessionStorage.getItem(ticketKey(token)) ?? undefined;
  });
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);

  function refresh(t?: string) {
    load({ data: { token, ticket: t } })
      .then(setState)
      .catch((e) => setState({ status: "error", error: e?.message }));
  }

  useEffect(() => { refresh(ticket); /* eslint-disable-next-line */ }, [token]);

  async function onUnlock(code: string) {
    const res: any = await unlock({ data: { token, code } });
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
      const { url, name } = await fileUrl({ data: { token, ticket, document_id: docId, mode } });
      if (mode === "download") window.open(url, "_blank", "noopener");
      else setViewer({ url, name });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open document");
    }
  }

  if (state.status === "loading") return <Shell><p>Loading…</p></Shell>;
  if (state.status === "not_found" || state.status === "error")
    return <Shell><Invalid title="Link not found" body="This magic link doesn't exist. Double-check the URL you were sent." /></Shell>;
  if (state.status === "expired")
    return <Shell><Invalid title="Link expired" body="Ask the person who shared this to create a new link." /></Shell>;
  if (state.status === "revoked")
    return <Shell><Invalid title="Access revoked" body="The person who shared this has revoked the link." /></Shell>;
  if (state.status === "locked")
    return <Shell><Invalid title="Access locked" body="Too many incorrect access codes were entered. Ask the sharer to issue a new code." /></Shell>;

  if (state.status === "code_required") {
    return (
      <Shell>
        <CodeGate
          sharerName={state.sharer?.full_name ?? "A TalVault user"}
          lovedOneName={state.share?.loved_one_name}
          onUnlock={onUnlock}
        />
      </Shell>
    );
  }

  const share = state.share;
  const canDownload = share.permission === "download";
  const folders: any[] = state.folders ?? [];
  const documents: any[] = state.documents ?? [];
  const byFolder = new Map<string | null, any[]>();
  for (const d of documents) {
    const k = d.folder_id ?? null;
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(d);
  }

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#064E58" }}>Hi {share.loved_one_name}</h1>
        <p style={{ color: "#65707A", fontSize: 14, marginTop: 6 }}>
          {state.sharer?.full_name ?? "A TalVault user"} has shared the {share.share_kind === "document" ? "document" : "documents"} below with you.
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12, color: "#65707A", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Clock className="h-3 w-3" /> Access ends {new Date(share.expires_at).toLocaleString()}
          </span>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600,
              color: canDownload ? "#0F7B5F" : "#B45309",
              background: canDownload ? "#ECFDF5" : "#FFFBEB",
              border: `1px solid ${canDownload ? "#B7EAD3" : "#FDE68A"}`,
              padding: "2px 10px", borderRadius: 999,
            }}
          >
            {canDownload ? <Download className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {canDownload ? "Download allowed" : "View only — downloading is disabled"}
          </span>
        </div>
        {share.note && (
          <div style={{ marginTop: 12, background: "#F9FAFB", border: "1px solid #E5E7EB", padding: 12, borderRadius: 8, fontSize: 13 }}>
            {share.note}
          </div>
        )}
      </div>

      {folders.map((f) => (
        <FolderBlock key={f.id} name={f.name} docs={byFolder.get(f.id) ?? []} canDownload={canDownload} onOpen={openDoc} />
      ))}

      {(byFolder.get(null)?.length ?? 0) > 0 && (
        <FolderBlock
          name={share.share_kind === "document" ? "Shared document" : "Additional documents"}
          docs={byFolder.get(null)!}
          canDownload={canDownload}
          onOpen={openDoc}
        />
      )}

      {documents.length === 0 && <p style={{ color: "#65707A", fontSize: 14 }}>Nothing has been shared with you yet — check back once documents are added.</p>}

      {viewer && (
        <WatermarkedViewer
          url={viewer.url}
          name={viewer.name}
          watermark={`${share.loved_one_email ?? share.loved_one_name} · ${new Date().toLocaleString()}`}
          onClose={() => setViewer(null)}
        />
      )}
    </Shell>
  );
}

function CodeGate({
  sharerName, lovedOneName, onUnlock,
}: {
  sharerName: string;
  lovedOneName?: string;
  onUnlock: (code: string) => Promise<{ ok: boolean; reason?: string; remaining?: number }>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await onUnlock(code);
      if (!res.ok) {
        setErr(
          res.reason === "locked"
            ? "Too many incorrect attempts. This link is now locked — ask the sharer for a new code."
            : `That access code isn't correct.${res.remaining != null ? ` ${res.remaining} attempt${res.remaining === 1 ? "" : "s"} left.` : ""}`,
        );
      }
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 28, maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: "#ECFDF5", color: "#064E58", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Lock className="h-6 w-6" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#064E58" }}>
        {lovedOneName ? `Hi ${lovedOneName}` : "Access code required"}
      </h1>
      <p style={{ color: "#65707A", fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
        <strong>{sharerName}</strong> has shared documents with you. For your security this link alone
        isn't enough — enter the access code they gave you directly.
      </p>
      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXXX-XXXXX"
          aria-label="Access code"
          autoComplete="off"
          style={{
            width: "100%", padding: "12px 14px", fontSize: 18, letterSpacing: 2, textAlign: "center",
            textTransform: "uppercase", border: "1px solid #d4d4d8", borderRadius: 8, fontFamily: "monospace",
          }}
        />
        {err && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 10 }}>{err}</p>}
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          style={{
            width: "100%", marginTop: 14, background: "#064E58", color: "white", border: 0,
            padding: "12px 16px", borderRadius: 8, fontWeight: 600, fontSize: 15,
            cursor: busy ? "wait" : "pointer", opacity: busy || code.trim().length < 4 ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <KeyRound className="h-4 w-4" /> {busy ? "Checking…" : "Unlock documents"}
        </button>
      </form>
      <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 14 }}>
        Never received a code? Contact {sharerName} directly — codes are never sent by email.
      </p>
    </div>
  );
}

function WatermarkedViewer({ url, name, watermark, onClose }: { url: string; name: string; watermark: string; onClose: () => void }) {
  const tiles = Array.from({ length: 24 });
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "min(980px, 100%)", height: "min(88vh, 100%)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Eye className="h-4 w-4" style={{ color: "#064E58" }} />
            <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</strong>
            <span style={{ fontSize: 11, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "2px 8px", borderRadius: 999 }}>
              View only · watermarked
            </span>
          </div>
          <button title="Close viewer" onClick={onClose} aria-label="Close viewer" style={{ border: 0, background: "transparent", cursor: "pointer", color: "#65707A" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div style={{ position: "relative", flex: 1, background: "#F5F5F1" }}>
          <iframe title={name} src={url} style={{ width: "100%", height: "100%", border: 0 }} />
          {/* Traceability watermark — overlaid, non-interactive, cannot be toggled off from the UI. */}
          <div
            data-testid="lo-watermark"
            aria-hidden
            style={{
              position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden",
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", alignContent: "space-around", gap: 12,
            }}
          >
            {tiles.map((_, i) => (
              <span
                key={i}
                style={{
                  transform: "rotate(-28deg)", textAlign: "center", fontSize: 12, fontWeight: 700,
                  color: "rgba(6,78,88,.20)", whiteSpace: "nowrap", overflow: "hidden", userSelect: "none",
                }}
              >
                {watermark}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid #E5E7EB", fontSize: 11, color: "#65707A" }}>
          This document is watermarked with your email and the time you opened it. Downloading is disabled for this share.
        </div>
      </div>
    </div>
  );
}

function FolderBlock({
  name, docs, canDownload, onOpen,
}: {
  name: string; docs: any[]; canDownload: boolean; onOpen: (id: string, mode: "view" | "download") => void;
}) {
  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Folder className="h-4 w-4" style={{ color: "#064E58" }} />
        <strong>{name}</strong>
        <span style={{ color: "#65707A", fontSize: 12 }}>({docs.length})</span>
      </div>
      {docs.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>No documents in this folder.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 10, border: "1px solid #F3F4F6", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText className="h-4 w-4" style={{ color: "#065E58" }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{d.name}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 11 }}>
                    {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB · ` : ""}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => onOpen(d.id, "view")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#064E58", color: "white", padding: "6px 12px", borderRadius: 6, fontSize: 13, border: 0, cursor: "pointer" }}
                >
                  <Eye className="h-3 w-3" /> View
                </button>
                {canDownload && (
                  <button
                    onClick={() => onOpen(d.id, "download")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", color: "#064E58", padding: "6px 12px", borderRadius: 6, fontSize: 13, border: "1px solid #064E58", cursor: "pointer" }}
                  >
                    <Download className="h-3 w-3" /> Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Invalid({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", padding: 20, borderRadius: 12, textAlign: "center" }}>
      <AlertTriangle className="h-8 w-8" style={{ color: "#E89348", margin: "0 auto 8px" }} />
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
      <p style={{ color: "#65707A", fontSize: 14, marginTop: 6 }}>{body}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F1", padding: "40px 16px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, background: "#064E58", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TalVaultIcon variant="white" style={{ height: 20, width: 20 }} />
          </div>
          <div>
            <TalVaultWordmark variant="teal" style={{ height: 16 }} />
            <div style={{ fontSize: 11, color: "#65707A" }}>Loved-One Access</div>
          </div>
        </div>
        {children}
        <div style={{ marginTop: 24, textAlign: "center", color: "#9CA3AF", fontSize: 11 }}>
          Access is time-bound and can be revoked at any time by the sharer.
        </div>
      </div>
    </div>
  );
}
