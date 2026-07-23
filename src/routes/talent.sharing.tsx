import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Share2, Key, Ban, Copy, Clock, Eye, Plus, Info, X } from "lucide-react";
import {
  listMyLovedOneShares,
  createLovedOneShare,
  revokeLovedOneShare,
} from "@/lib/loved-one.functions";
import { listPrivateVault } from "@/lib/talent-vault.functions";

export const Route = createFileRoute("/talent/sharing")({
  head: () => ({ meta: [{ title: "Shared Access · TalVault Talent" }] }),
  component: SharingPage,
});

function SharingPage() {
  const load = useServerFn(listMyLovedOneShares);
  const revoke = useServerFn(revokeLovedOneShare);
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);

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

  function copyLink(token: string) {
    const url = `${window.location.origin}/loved-one/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Shared Access</h1>
          <div className="tvp-subtitle">
            Share private documents with a Loved One via a time-bound magic link. No account needed on their side.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary" onClick={() => setShowModal(true)}>
            <Share2 className="h-4 w-4" /> New Loved-One share
          </button>
        </div>
      </div>

      <div className="tvp-callout" style={{ background: "#ECFDF5", borderColor: "#B7EAD3" }}>
        <div className="tvp-callout-icon" style={{ background: "var(--tvp-green-bg)", color: "var(--tvp-green)" }}>
          <Key className="h-4 w-4" />
        </div>
        <div>
          <strong>Magic-link access.</strong>{" "}
          <span className="tvp-muted">Copy the link and send it to your Loved One out-of-band (WhatsApp, email). The link expires automatically and you can revoke it any time.</span>
        </div>
      </div>

      {freshLink && (
        <div className="tvp-callout" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
          <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
          <div style={{ flex: 1 }}>
            <strong>Share created.</strong> Copy this link and send it to your Loved One:
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input readOnly value={freshLink} style={{ flex: 1, padding: "8px 10px", fontSize: 12, border: "1px solid #d4d4d8", borderRadius: 6 }} />
              <button className="tvp-primary" onClick={() => { navigator.clipboard.writeText(freshLink); toast.success("Link copied"); }}>
                <Copy className="h-4 w-4" /> Copy
              </button>
              <button className="tvp-mini-btn" onClick={() => setFreshLink(null)}><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}

      <div className="tvp-card">
        {isLoading ? (
          <p className="tvp-muted" style={{ padding: 16 }}>Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div className="tvp-kpi-icon tvp-bg-blue" style={{ width: 46, height: 46, margin: "0 auto 10px" }}>
              <Share2 className="h-5 w-5" />
            </div>
            <strong>No shares yet</strong>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Create your first Loved-One share to get started.</p>
          </div>
        ) : (
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead><tr><th>Recipient</th><th>Scope</th><th>Expires</th><th>Views</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(data ?? []).map((s: any) => {
                  const now = Date.now();
                  const exp = new Date(s.expires_at).getTime();
                  const revoked = !!s.revoked_at || s.is_active === false;
                  const expired = exp < now;
                  const status = revoked ? "revoked" : expired ? "expired" : (exp - now < 3 * 86400_000) ? "expiring" : "active";
                  const scope = (s.scope?.private_folder_ids?.length ?? 0) + " folder(s), " + (s.scope?.private_document_ids?.length ?? 0) + " doc(s)";
                  const tone = status === "active" ? "green" : status === "expiring" ? "amber" : "teal";
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.loved_one_name ?? s.loved_one_email}</strong>
                        <div className="tvp-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {s.loved_one_email}{s.relationship ? ` · ${s.relationship}` : ""}
                        </div>
                      </td>
                      <td>{scope}</td>
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
                            <button className="tvp-mini-btn" aria-label="Copy link" title="Copy link" onClick={() => copyLink(s.token)}>
                              <Copy className="h-4 w-4" />
                            </button>
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
          onCreated={(token) => {
            setShowModal(false);
            setFreshLink(`${window.location.origin}/loved-one/${token}`);
            qc.invalidateQueries({ queryKey: ["talent", "loved-shares"] });
          }}
        />
      )}
    </>
  );
}

function NewShareModal({ onClose, onCreated }: { onClose: () => void; onCreated: (token: string) => void }) {
  const loadVault = useServerFn(listPrivateVault);
  const create = useServerFn(createLovedOneShare);
  const { data: vault, isLoading } = useQuery({ queryKey: ["talent", "private-vault"], queryFn: () => loadVault() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rel, setRel] = useState("");
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set());
  const [docIds, setDocIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const topFolders = useMemo(() => (vault?.folders ?? []).filter((f: any) => !f.parent_id), [vault]);

  function toggle(set: Set<string>, id: string, setter: (v: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  async function save() {
    if (!name.trim() || !email.trim()) { toast.error("Name and email required"); return; }
    if (folderIds.size === 0 && docIds.size === 0) { toast.error("Select at least one folder or document"); return; }
    setSaving(true);
    try {
      const { token } = await create({
        data: {
          loved_one_name: name.trim(),
          loved_one_email: email.trim(),
          relationship: rel.trim() || undefined,
          days,
          private_folder_ids: Array.from(folderIds),
          private_document_ids: Array.from(docIds),
          note: note.trim() || undefined,
        },
      });
      onCreated(token);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create share");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="tvp-modal-head">
          <h2 className="tvp-h2"><Plus className="h-5 w-5" /> New Loved-One share</h2>
          <button className="tvp-mini-btn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="tvp-modal-body">
          <div className="tvp-form-grid">
            <div className="tvp-form-group"><label>Loved-One name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Mokoena" /></div>
            <div className="tvp-form-group"><label>Email (for reference)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" /></div>
            <div className="tvp-form-group"><label>Relationship</label><input value={rel} onChange={(e) => setRel(e.target.value)} placeholder="Spouse, Sibling, Advisor…" /></div>
            <div className="tvp-form-group"><label>Access duration (days)</label><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
          </div>

          <h3 className="tvp-h3" style={{ marginTop: 16 }}>Which private folders can they see?</h3>
          {isLoading ? <p className="tvp-muted">Loading vault…</p> : (
            <div className="tvp-doc-grid">
              {topFolders.map((f: any) => (
                <label key={f.id} className="tvp-doc-card" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={folderIds.has(f.id)} onChange={() => toggle(folderIds, f.id, setFolderIds)} style={{ width: 18, height: 18 }} />
                  <div><strong>{f.name}</strong></div>
                  <span />
                </label>
              ))}
            </div>
          )}

          <div className="tvp-form-group" style={{ marginTop: 14 }}>
            <label>Optional note</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Something to tell the recipient." />
          </div>
        </div>
        <div className="tvp-modal-foot">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button className="tvp-primary" disabled={saving} onClick={save}>
            {saving ? "Creating…" : "Create magic link"}
          </button>
        </div>
      </div>
    </div>
  );
}
