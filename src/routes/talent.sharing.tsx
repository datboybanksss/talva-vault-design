import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Share2, Key, Ban, Copy, Clock, Eye, Plus, Info, X, Lock, Download, RefreshCw, Mail, FileText } from "lucide-react";
import {
  listMyLovedOneShares,
  createLovedOneShare,
  revokeLovedOneShare,
  regenerateAccessCode,
} from "@/lib/loved-one.functions";
import { listPrivateVault } from "@/lib/talent-vault.functions";

export const Route = createFileRoute("/talent/sharing")({
  head: () => ({ meta: [{ title: "Shared Access · TalVault Talent" }] }),
  component: SharingPage,
});

type FreshShare = { link: string; code: string; email: { sent: boolean; reason?: string }; recipient: string };

function SharingPage() {
  const load = useServerFn(listMyLovedOneShares);
  const revoke = useServerFn(revokeLovedOneShare);
  const regen = useServerFn(regenerateAccessCode);
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [fresh, setFresh] = useState<FreshShare | null>(null);
  const [codeModal, setCodeModal] = useState<FreshShare | null>(null);


  const { data, isLoading } = useQuery({ queryKey: ["talent", "loved-shares"], queryFn: () => load() });

  async function onRevoke(id: string) {
    if (!confirm("Revoke this share? The magic link will stop working immediately.")) return;
    try {
      await revoke({ data: { id } });
      toast.success("Share revoked");
      qc.invalidateQueries({ queryKey: ["talent", "loved-shares"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to revoke");
    }
  }

  async function onRegen(s: any) {
    if (!confirm("Issue a new access code? The previous code stops working immediately.")) return;
    try {
      const { access_code } = await regen({ data: { id: s.id } });
      setCodeModal({
        link: `${window.location.origin}/loved-one/${s.token}`,
        code: access_code,
        email: { sent: false, reason: "regenerated" },
        recipient: s.loved_one_name ?? s.loved_one_email,
      });
      qc.invalidateQueries({ queryKey: ["talent", "loved-shares"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to regenerate code");
    }
  }


  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/loved-one/${token}`);
    toast.success("Link copied");
  }

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Shared Access</h1>
          <div className="tvp-subtitle">
            Share private documents with a Loved One via a time-bound magic link plus a one-time access code.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary" onClick={() => setShowModal(true)}>
            <Share2 className="h-4 w-4" /> New share
          </button>
        </div>
      </div>

      <div className="tvp-callout" style={{ background: "#ECFDF5", borderColor: "#B7EAD3" }}>
        <div className="tvp-callout-icon" style={{ background: "var(--tvp-green-bg)", color: "var(--tvp-green)" }}>
          <Key className="h-4 w-4" />
        </div>
        <div>
          <strong>Two-factor by design.</strong>{" "}
          <span className="tvp-muted">
            The link goes to your Loved One by email; the access code never does. Give them the code yourself
            (call or message) so an intercepted inbox alone can't open your documents.
          </span>
        </div>
      </div>

      {fresh && <FreshSharePanel fresh={fresh} onDismiss={() => setFresh(null)} />}

      <div className="tvp-card">
        {isLoading ? (
          <p className="tvp-muted" style={{ padding: 16 }}>Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div className="tvp-kpi-icon tvp-bg-blue" style={{ width: 46, height: 46, margin: "0 auto 10px" }}>
              <Share2 className="h-5 w-5" />
            </div>
            <strong>No shares yet</strong>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Create your first share to get started.</p>
          </div>
        ) : (
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr><th>Recipient</th><th>Scope</th><th>Access</th><th>Expires</th><th>Views</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {(data ?? []).map((s: any) => {
                  const now = Date.now();
                  const exp = new Date(s.expires_at).getTime();
                  const revoked = !!s.revoked_at || s.is_active === false;
                  const expired = exp < now;
                  const locked = !!s.locked_at;
                  const status = revoked ? "revoked" : expired ? "expired" : locked ? "locked" : (exp - now < 3 * 86400_000) ? "expiring" : "active";
                  const scope =
                    s.share_kind === "document"
                      ? "1 document"
                      : `${s.scope?.private_folder_ids?.length ?? 0} folder(s)`;
                  const tone = status === "active" ? "green" : status === "expiring" || status === "locked" ? "amber" : "teal";
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.loved_one_name ?? s.loved_one_email}</strong>
                        <div className="tvp-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {s.loved_one_email}{s.relationship ? ` · ${s.relationship}` : ""}
                          {s.email_sent_at ? " · emailed" : ""}
                        </div>
                      </td>
                      <td>{scope}</td>
                      <td>
                        <span className={`tvp-status ${s.permission === "download" ? "tvp-green" : "tvp-amber"}`}>
                          {s.permission === "download" ? "Download" : "View only"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock className="h-3 w-3" /> {new Date(s.expires_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Eye className="h-3 w-3" /> {s.view_count ?? 0}
                        </div>
                      </td>
                      <td><span className={`tvp-status tvp-${tone}`}>{status}</span></td>
                      <td>
                        <div className="tvp-row-actions">
                          {!revoked && !expired && (
                            <>
                              <button className="tvp-mini-btn" aria-label="Copy link" title="Copy link" onClick={() => copyLink(s.token)}>
                                <Copy className="h-4 w-4" />
                              </button>
                              <button className="tvp-mini-btn" aria-label="New access code" title="Issue a new access code" onClick={() => onRegen(s)}>
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {!revoked && (
                            <button className="tvp-mini-btn" aria-label="Revoke" title="Revoke" onClick={() => onRevoke(s.id)}>
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <NewShareModal
          onClose={() => setShowModal(false)}
          onCreated={(f) => {
            setShowModal(false);
            setFresh(f);
            qc.invalidateQueries({ queryKey: ["talent", "loved-shares"] });
          }}
        />
      )}

      {codeModal && <AccessCodeModal fresh={codeModal} onClose={() => setCodeModal(null)} />}

    </>
  );
}

function FreshSharePanel({ fresh, onDismiss }: { fresh: FreshShare; onDismiss: () => void }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <>
      <div className="tvp-callout" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong>Share ready for {fresh.recipient}.</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tvp-secondary" onClick={() => { navigator.clipboard.writeText(fresh.link); toast.success("Link copied"); }}>
              <Copy className="h-4 w-4" /> Copy link
            </button>
            <button className="tvp-primary" onClick={() => setShowCode(true)}>
              <Lock className="h-4 w-4" /> View access code
            </button>
          </div>
        </div>
        <button className="tvp-mini-btn" onClick={onDismiss} aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
      {showCode && <AccessCodeModal fresh={fresh} onClose={() => setShowCode(false)} />}
    </>
  );
}

function AccessCodeModal({ fresh, onClose }: { fresh: FreshShare; onClose: () => void }) {
  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="tvp-modal-head">
          <h2 className="tvp-h2"><Lock className="h-5 w-5" /> Access code</h2>
          <button className="tvp-mini-btn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="tvp-modal-body">
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
              <Lock className="h-4 w-4" /> Shown once — copy it now
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <code style={{ flex: 1, fontSize: 20, letterSpacing: 3, fontFamily: "monospace", background: "white", border: "1px solid #FDE68A", borderRadius: 6, padding: "8px 12px", textAlign: "center" }}>
                {fresh.code}
              </code>
              <button className="tvp-secondary" onClick={() => { navigator.clipboard.writeText(fresh.code); toast.success("Access code copied"); }}>
                <Copy className="h-4 w-4" /> Copy code
              </button>
            </div>
            <p className="tvp-muted" style={{ fontSize: 12, marginTop: 8 }}>
              Send this to {fresh.recipient} <strong>separately from the link</strong> — by phone or message.
              We never include it in email. If it's lost, issue a new code from the table.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input readOnly value={fresh.link} style={{ flex: 1, padding: "8px 10px", fontSize: 12, border: "1px solid #d4d4d8", borderRadius: 6 }} />
            <button className="tvp-secondary" onClick={() => { navigator.clipboard.writeText(fresh.link); toast.success("Link copied"); }}>
              <Copy className="h-4 w-4" /> Copy link
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12 }} className="tvp-muted">
            <Mail className="h-3 w-3" />
            {fresh.email.sent
              ? "Notification email sent to your Loved One (link only, no code)."
              : fresh.email.reason === "email_not_configured"
                ? "Email sending isn't set up on this project yet — copy the link and send it yourself."
                : fresh.email.reason === "regenerated"
                  ? "New code issued. The link is unchanged."
                  : "Notification email wasn't sent — copy the link and send it yourself."}
          </div>
        </div>
        <div className="tvp-modal-foot">
          <button className="tvp-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}


function NewShareModal({ onClose, onCreated }: { onClose: () => void; onCreated: (f: FreshShare) => void }) {
  const loadVault = useServerFn(listPrivateVault);
  const create = useServerFn(createLovedOneShare);
  const { data: vault, isLoading } = useQuery({ queryKey: ["talent", "private-vault"], queryFn: () => loadVault() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("");
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"folders" | "document">("folders");
  const [permission, setPermission] = useState<"view" | "download">("view");
  const [sendEmail, setSendEmail] = useState(true);
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set());
  const [docId, setDocId] = useState<string>("");
  const [docSearch, setDocSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const topFolders = useMemo(() => (vault?.folders ?? []).filter((f: any) => !f.parent_id), [vault]);
  const allDocs = useMemo(() => (vault as any)?.documents ?? [], [vault]);
  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const list = q ? allDocs.filter((d: any) => d.name.toLowerCase().includes(q)) : allDocs;
    return list.slice(0, 50);
  }, [allDocs, docSearch]);

  function toggleFolder(id: string) {
    const next = new Set(folderIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFolderIds(next);
  }

  async function save() {
    if (!name.trim() || !email.trim()) { toast.error("Name and email required"); return; }
    if (kind === "folders" && folderIds.size === 0) { toast.error("Select at least one folder"); return; }
    if (kind === "document" && !docId) { toast.error("Pick a document to share"); return; }
    setSaving(true);
    try {
      const res: any = await create({
        data: {
          loved_one_name: name.trim(),
          loved_one_email: email.trim(),
          relationship: rel.trim() || undefined,
          days,
          share_kind: kind,
          permission,
          send_email: sendEmail,
          private_folder_ids: kind === "folders" ? Array.from(folderIds) : [],
          private_document_ids: kind === "document" ? [docId] : [],
          note: note.trim() || undefined,
        },
      });
      onCreated({
        link: `${window.location.origin}/loved-one/${res.token}`,
        code: res.access_code,
        email: res.email,
        recipient: name.trim(),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create share");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="tvp-modal-head">
          <h2 className="tvp-h2"><Plus className="h-5 w-5" /> New share</h2>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="tvp-modal-body">
          <div className="tvp-form-grid">
            <div className="tvp-form-group"><label>Loved One name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Mokoena" /></div>
            <div className="tvp-form-group"><label>Email (link is sent here)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" /></div>
            <div className="tvp-form-group"><label>Relationship</label><input value={rel} onChange={(e) => setRel(e.target.value)} placeholder="Spouse, Sibling, Advisor…" /></div>
            <div className="tvp-form-group"><label>Access duration (days)</label><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
          </div>

          <h3 className="tvp-h3" style={{ marginTop: 16 }}>What are you sharing?</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <ChoiceChip active={kind === "folders"} onClick={() => setKind("folders")} label="Whole folders" />
            <ChoiceChip active={kind === "document"} onClick={() => setKind("document")} label="A single document" />
          </div>

          {kind === "folders" ? (
            isLoading ? <p className="tvp-muted" style={{ marginTop: 10 }}>Loading vault…</p> : (
              <div className="tvp-doc-grid" style={{ marginTop: 10 }}>
                {topFolders.map((f: any) => (
                  <label key={f.id} className="tvp-doc-card" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={folderIds.has(f.id)} onChange={() => toggleFolder(f.id)} style={{ width: 18, height: 18 }} />
                    <div><strong>{f.name}</strong></div>
                    <span />
                  </label>
                ))}
              </div>
            )
          ) : (
            <div style={{ marginTop: 10 }}>
              <input
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search your documents…"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #d4d4d8", borderRadius: 6, fontSize: 13 }}
              />
              <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, border: "1px solid #E5E7EB", borderRadius: 8 }}>
                {filteredDocs.length === 0 ? (
                  <p className="tvp-muted" style={{ padding: 12, fontSize: 13 }}>No documents found.</p>
                ) : filteredDocs.map((d: any) => (
                  <label
                    key={d.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderBottom: "1px solid #F3F4F6", cursor: "pointer",
                      background: docId === d.id ? "var(--tvp-teal-50, #ECFDF5)" : "transparent",
                    }}
                  >
                    <input type="radio" name="single-doc" checked={docId === d.id} onChange={() => setDocId(d.id)} />
                    <FileText className="h-4 w-4" style={{ color: "var(--tvp-teal, #064E58)" }} />
                    <span style={{ fontSize: 13 }}>{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <h3 className="tvp-h3" style={{ marginTop: 18 }}>What can they do?</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <ChoiceChip active={permission === "view"} onClick={() => setPermission("view")} label="View only (watermarked)" icon={<Eye className="h-3 w-3" />} />
            <ChoiceChip active={permission === "download"} onClick={() => setPermission("download")} label="View & download" icon={<Download className="h-3 w-3" />} />
          </div>
          <p className="tvp-muted" style={{ fontSize: 12, marginTop: 6 }}>
            {permission === "view"
              ? "Documents open in a watermarked viewer stamped with their email and the time. Downloads are blocked on the server, not just hidden."
              : "They can save copies of these documents to their own device."}
          </p>

          <div className="tvp-form-group" style={{ marginTop: 14 }}>
            <label>Optional note</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Something to tell the recipient." />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            Email the link to {name.trim() || "your Loved One"} (the access code is never emailed)
          </label>
        </div>
        <div className="tvp-modal-foot">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button className="tvp-primary" disabled={saving} onClick={save}>
            {saving ? "Creating…" : "Create secure share"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceChip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 13,
        fontWeight: active ? 600 : 500, cursor: "pointer",
        border: `1px solid ${active ? "var(--tvp-teal, #064E58)" : "#E5E7EB"}`,
        background: active ? "var(--tvp-teal-50, #ECFDF5)" : "white",
        color: active ? "var(--tvp-teal, #064E58)" : "#65707A",
      }}
    >
      {icon}{label}
    </button>
  );
}
