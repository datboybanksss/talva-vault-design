import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertCircle, Upload, Trash2, FileText, Link2, RefreshCw, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createIndependentTalentDraft,
  updateIndependentTalentDraft,
  getIndependentTalentInvitation,
  recordIndependentTalentDocument,
  deleteIndependentTalentDocument,
  getIndependentTalentDocumentUrl,
  finalizeIndependentTalentInvitation,
  resendIndependentTalentInvitation,
  revokeIndependentTalentInvitation,
  deleteIndependentTalentDraft,
} from "@/lib/independent-talent.functions";
import { EMAIL_FALLBACK_NOTICE } from "@/lib/invitation-email";
import { logTalentInviteCopyLink } from "@/lib/admin.functions";
import { useFolderCatalogue, talentTypesFrom } from "@/lib/folder-catalogue";
import { ageOn, MINIMUM_TALENT_AGE, UNDER_AGE_MESSAGE } from "@/lib/terms";
import { DOCUMENT_ACCEPT, preflightUpload } from "@/lib/file-validation";

const BUCKET = "talent-invite-docs";
const SLOTS = [
  { key: "id_document", label: "ID document" },
  { key: "proof_of_talent", label: "Proof of talent" },
] as const;

const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

function daysUntil(iso?: string | null) {
  if (!iso) return 14;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d >= 1 && d <= 60 ? d : 14;
}

/**
 * Admin "Invite talent" (independent, no agency). Mirrors the agency invite
 * draft flow: details → draft → two documents → send.
 */
export function TalentInviteForm({ draftId: initialId }: { draftId?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createIndependentTalentDraft);
  const updateFn = useServerFn(updateIndependentTalentDraft);
  const getFn = useServerFn(getIndependentTalentInvitation);
  const recordFn = useServerFn(recordIndependentTalentDocument);
  const deleteDocFn = useServerFn(deleteIndependentTalentDocument);
  const docUrlFn = useServerFn(getIndependentTalentDocumentUrl);
  const finalizeFn = useServerFn(finalizeIndependentTalentInvitation);
  const resendFn = useServerFn(resendIndependentTalentInvitation);
  const revokeFn = useServerFn(revokeIndependentTalentInvitation);
  const deleteDraftFn = useServerFn(deleteIndependentTalentDraft);
  const logCopyFn = useServerFn(logTalentInviteCopyLink);

  const [draftId, setDraftId] = useState(initialId ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [talentType, setTalentType] = useState("");
  const [dob, setDob] = useState("");
  const [expiryDays, setExpiryDays] = useState(14);

  const invQ = useQuery({
    queryKey: ["admin", "talent-invite", draftId],
    queryFn: () => getFn({ data: { id: draftId } }),
    enabled: !!draftId,
  });
  const inv: any = invQ.data?.invitation;
  const docs: any[] = invQ.data?.documents ?? [];
  const status: string = inv?.status ?? "draft";
  const isDraft = !draftId || status === "draft";

  useEffect(() => {
    if (!inv) return;
    setName(inv.talent_name ?? "");
    setEmail(inv.email ?? "");
    setTalentType(inv.talent_type ?? "");
    setDob(inv.date_of_birth ?? "");
    setExpiryDays(daysUntil(inv.expires_at));
  }, [inv?.id]);

  const catalogue = useFolderCatalogue();
  const typeOptions = useMemo(() => {
    const list = talentTypesFrom(catalogue);
    return talentType && !list.includes(talentType) ? [talentType, ...list] : list;
  }, [catalogue, talentType]);

  const dobError = dob && ageOn(dob) < MINIMUM_TALENT_AGE ? UNDER_AGE_MESSAGE : null;
  const detailsComplete = !!(name.trim().length >= 2 && email.trim() && dob && !dobError);
  const payload = () => ({ talent_name: name, email, talent_type: talentType, date_of_birth: dob });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const createM = useMutation({
    mutationFn: () => createFn({ data: payload() }),
    onSuccess: (row: any) => {
      refresh();
      setDraftId(row.id);
      toast.success("Draft saved. You can keep editing it until you send.");
      nav({ to: "/admin/invitations/talent/$id", params: { id: row.id }, replace: true });
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't save the draft."),
  });
  const updateM = useMutation({
    mutationFn: () => updateFn({ data: { id: draftId, ...payload() } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft updated.");
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't update the draft."),
  });

  const sendResult = (res: any, okMsg: string) => {
    refresh();
    if (res?.email_sent) toast.success(okMsg);
    else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
  };

  const finalizeM = useMutation({
    mutationFn: async () => {
      await updateFn({ data: { id: draftId, ...payload() } });
      return finalizeFn({ data: { id: draftId, expiry_days: expiryDays } });
    },
    onSuccess: (res: any) => {
      sendResult(res, "Invitation sent. The talent will receive the branded email.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't send the invitation."),
  });
  const resendM = useMutation({
    mutationFn: () => resendFn({ data: { id: draftId, extend_days: 14 } }),
    onSuccess: (res: any) => sendResult(res, "Invitation resent · expiry refreshed · logged."),
    onError: (e: any) => toast.error(e.message ?? "We couldn't resend the invitation."),
  });
  const revokeM = useMutation({
    mutationFn: () => revokeFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      toast.success("Invitation revoked. The ID document and proof of talent were deleted.");
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't revoke the invitation."),
  });
  const deleteDraftM = useMutation({
    mutationFn: () => deleteDraftFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft and its documents deleted.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't delete the draft."),
  });
  const deleteDocM = useMutation({
    mutationFn: (id: string) => deleteDocFn({ data: { id } }),
    onSuccess: () => {
      invQ.refetch();
      refresh();
      toast.success("Document removed.");
    },
    onError: (e: any) => toast.error(e.message ?? "We couldn't remove the document."),
  });

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});

  async function uploadForSlot(slotKey: string, file: File) {
    if (!draftId) return;
    const norm = (n: string) => n.trim().toLowerCase();
    if (docs.some((d) => norm(d.file_name ?? "") === norm(file.name))) {
      setSlotErrors((p) => ({ ...p, [slotKey]: `A document named "${file.name}" has already been uploaded for this invitation.` }));
      return;
    }
    const pre = preflightUpload(file);
    if (pre) {
      setSlotErrors((p) => ({ ...p, [slotKey]: pre }));
      return;
    }
    setSlotErrors((p) => {
      const n = { ...p };
      delete n[slotKey];
      return n;
    });
    setUploadingSlot(slotKey);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${draftId}/${slotKey}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      await recordFn({
        data: { invitation_id: draftId, doc_slot: slotKey as any, file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size },
      });
      invQ.refetch();
      refresh();
      toast.success(`${file.name} uploaded.`);
    } catch (e: any) {
      setSlotErrors((p) => ({ ...p, [slotKey]: e?.message ?? "Upload failed" }));
    } finally {
      setUploadingSlot(null);
    }
  }

  const openDoc = async (id: string) => {
    try {
      const { url } = await docUrlFn({ data: { id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e.message ?? "We couldn't open that document.");
    }
  };

  const copyLink = async () => {
    const url = invQ.data?.invite_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      await logCopyFn({ data: { id: draftId } }).catch(() => undefined);
      toast.success("Link copied. Copy does not extend expiry.");
    } catch {
      toast.error("Copy failed");
    }
  };

  const uploaded = new Set(docs.map((d) => d.doc_slot));
  const missing = SLOTS.filter((s) => !uploaded.has(s.key));
  const saving = createM.isPending || updateM.isPending;
  const canSend = !!draftId && isDraft && detailsComplete && missing.length === 0 && !finalizeM.isPending;
  const outstanding = [
    ...(detailsComplete ? [] : ["talent details"]),
    ...missing.map((s) => s.label.toLowerCase()),
  ];

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/invitations" className="tvp-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {!draftId ? "Invite talent" : isDraft ? "Continue talent invitation" : "Talent invitation"}
          </h1>
          <div className="tvp-subtitle">
            Independent talent join TalVault without an agency. Save a draft at any point; everything stays editable until you send.
          </div>
        </div>
        {draftId && !isDraft && (
          <div className="tvp-actions" data-tour="admin-talent-invite-actions">
            <span className="tvp-status tvp-blue">{statusLabel[status] ?? status}</span>
            {status === "pending" && (
              <>
                <button className="tvp-secondary" onClick={copyLink}><Link2 className="h-4 w-4" />Copy invite link</button>
                <button className="tvp-secondary" disabled={resendM.isPending} onClick={() => resendM.mutate()}><RefreshCw className="h-4 w-4" />Resend</button>
                <button
                  className="tvp-secondary"
                  disabled={revokeM.isPending}
                  onClick={() => confirm(`Revoke the invitation to ${name}? Their ID document and proof of talent will be deleted.`) && revokeM.mutate()}
                ><Ban className="h-4 w-4" />Revoke</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="tvp-card tvp-panel" data-tour="admin-talent-invite-details">
        <fieldset disabled={!isDraft} style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="tvp-form-group">
            <label>Full name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thandi Mokoena" />
          </div>
          <div className="tvp-form-group">
            <label>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="tvp-form-group">
            <label>Talent type</label>
            <select value={talentType} onChange={(e) => setTalentType(e.target.value)}>
              <option value="">Not specified</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="tvp-form-group">
            <label>Date of birth *</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-invalid={!!dobError || undefined} />
            {dobError && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tvp-red)" }}>{dobError}</div>}
          </div>
          <div className="tvp-form-group">
            <label>Invitation expiry (days)</label>
            <input type="number" min={1} max={60} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value) || 14)} />
          </div>
        </fieldset>

        {isDraft && (
          <>
            <div className="tvp-footer-actions">
              {draftId && (
                <button
                  type="button"
                  className="tvp-secondary"
                  disabled={deleteDraftM.isPending}
                  onClick={() => confirm("Delete this draft and its documents? This cannot be undone.") && deleteDraftM.mutate()}
                >
                  <Trash2 className="h-4 w-4" />Delete draft
                </button>
              )}
              <Link to="/admin/invitations" className="tvp-secondary">{draftId ? "Close" : "Cancel"}</Link>
              <button
                className="tvp-primary"
                type="button"
                disabled={!detailsComplete || saving}
                onClick={() => (draftId ? updateM.mutate() : createM.mutate())}
              >
                {saving ? "Saving…" : draftId ? "Save draft" : "Save draft & continue →"}
              </button>
            </div>
            {!detailsComplete && (
              <p className="tvp-muted" style={{ fontSize: 12, textAlign: "right", marginTop: 6 }}>
                Add a full name, email and date of birth (18 or older) to save a draft.
              </p>
            )}
          </>
        )}
      </div>

      {draftId && (isDraft || docs.length > 0) && (
        <div className="tvp-card tvp-panel" style={{ marginTop: 16 }} data-tour="admin-talent-invite-docs">
          <h2 className="tvp-h2">Documents</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            One file per slot. Both are required before the invitation can be sent. Documents are stored privately, are visible only to administrators, and are deleted if the invitation is revoked or expires.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {SLOTS.map((slot) => {
              const files = docs.filter((d) => d.doc_slot === slot.key);
              const has = files.length > 0;
              const busy = uploadingSlot === slot.key;
              return (
                <div
                  key={slot.key}
                  className="tvp-callout"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${has ? "var(--tvp-green)" : "var(--tvp-border)"}`,
                    background: "var(--tvp-surface)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {has ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--tvp-green)" }} /> : <AlertCircle className="h-4 w-4" style={{ color: "var(--tvp-amber)" }} />}
                      <strong style={{ fontSize: 14 }}>{slot.label}</strong>
                      <span className="tvp-muted" style={{ fontSize: 12 }}>{has ? "Uploaded" : "Required"}</span>
                    </div>
                    {isDraft && !has && (
                      <label className="tvp-secondary" style={{ cursor: "pointer" }}>
                        <Upload className="h-4 w-4" />
                        {busy ? "Uploading…" : "Upload"}
                        <input
                          type="file"
                          accept={DOCUMENT_ACCEPT}
                          style={{ display: "none" }}
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadForSlot(slot.key, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {slotErrors[slot.key] && (
                    <p role="alert" style={{ margin: "8px 0 0", fontSize: 12, color: "var(--tvp-red)" }}>{slotErrors[slot.key]}</p>
                  )}
                  {files.map((u) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0 0" }}>
                      <FileText className="h-3.5 w-3.5" style={{ color: "var(--tvp-muted)" }} />
                      <button type="button" className="tvp-link" onClick={() => openDoc(u.id)}>{u.file_name}</button>
                      <span className="tvp-muted" style={{ fontSize: 11 }}>{u.size_bytes ? `${Math.round(u.size_bytes / 1024)} KB` : ""}</span>
                      {isDraft && (
                        <button className="tvp-mini-btn" title="Remove" style={{ marginLeft: "auto" }} onClick={() => deleteDocM.mutate(u.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {isDraft && (
            <>
              <div className="tvp-footer-actions">
                <Link to="/admin/invitations" className="tvp-secondary">Save & close</Link>
                <button type="button" className="tvp-primary" disabled={!canSend} onClick={() => finalizeM.mutate()}>
                  {finalizeM.isPending ? "Sending…" : "Send invitation"}
                </button>
              </div>
              {!canSend && outstanding.length > 0 && (
                <p className="tvp-muted" style={{ fontSize: 12, textAlign: "right", marginTop: 6 }}>
                  Still outstanding: {outstanding.join(", ")}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
