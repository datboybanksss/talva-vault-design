import { BlockedDocumentPill } from "@/components/shared/blocked-document";
import { quarantineReason } from "@/lib/document-quarantine";
import {
  deleteStagedOnboardingDocument,
  listStagedOnboardingDocuments,
  stageOnboardingDocument,
} from "@/lib/onboarding-staging.functions";
import { useConfirm } from "@/components/shared/use-confirm";
import { InviteEmailFieldError, useInviteEmailCheck } from "@/components/shared/invite-email-check";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { InvitationTypeField } from "@/components/admin/invitation-type-field";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Upload,
  Trash2,
  FileText,
  Link2,
  RefreshCw,
  Ban,
  Mail,
} from "lucide-react";
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
import {
  EMAIL_FALLBACK_NOTICE,
  missingMergeFields,
  wordingIssues,
  type AdminInviteWording,
} from "@/lib/invitation-email";
import {
  getAdminInviteEmailContext,
  saveAdminInviteWording,
} from "@/lib/admin-invite-email.functions";
import { InviteEmailReview } from "@/components/admin/invite-email-review";
import { InviteSteps, previewExpiry } from "@/components/admin/invite-steps";
import { logTalentInviteCopyLink } from "@/lib/admin.functions";
import { useFolderCatalogue, talentTypesFrom } from "@/lib/folder-catalogue";
import { ageOn, MINIMUM_TALENT_AGE, UNDER_AGE_MESSAGE } from "@/lib/terms";
import { DOCUMENT_ACCEPT, preflightUpload } from "@/lib/file-validation";
import { friendlyError } from "@/lib/friendly-error";

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
export function TalentInviteForm({
  draftId: initialId,
  typeSlot,
}: {
  draftId?: string;
  typeSlot?: ReactNode;
}) {
  const { confirm: askConfirm, dialog: askConfirmDialog } = useConfirm();
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
  const stageFn = useServerFn(stageOnboardingDocument);
  const listStagedFn = useServerFn(listStagedOnboardingDocuments);
  const deleteStagedFn = useServerFn(deleteStagedOnboardingDocument);
  // Files uploaded before the first Save draft are staged under this id.
  const [onboardingSessionId] = useState(() => crypto.randomUUID());

  const [draftId, setDraftId] = useState(initialId ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [talentType, setTalentType] = useState("");
  const [dob, setDob] = useState("");
  const [expiryDays, setExpiryDays] = useState(14);
  const [step, setStep] = useState<"details" | "review">("details");
  const [wording, setWording] = useState<AdminInviteWording | null>(null);
  const saveWordingFn = useServerFn(saveAdminInviteWording);
  const ctxFn = useServerFn(getAdminInviteEmailContext);
  const ctxQ = useQuery({
    queryKey: ["admin", "invite-email-context", "talent", draftId],
    queryFn: () => ctxFn({ data: { kind: "talent", id: draftId } }),
    enabled: !!draftId,
  });
  useEffect(() => {
    if (ctxQ.data?.saved) setWording(ctxQ.data.saved);
  }, [ctxQ.data?.saved?.subject, ctxQ.data?.saved?.greeting, ctxQ.data?.saved?.message]);

  const invQ = useQuery({
    queryKey: ["admin", "talent-invite", draftId],
    queryFn: () => getFn({ data: { id: draftId } }),
    enabled: !!draftId,
  });
  const inv: any = invQ.data?.invitation;
  const stagedQ = useQuery({
    queryKey: ["admin", "staged", "talent", onboardingSessionId],
    queryFn: () => listStagedFn({ data: { kind: "talent", session_id: onboardingSessionId } }),
    enabled: !draftId,
  });
  const docs: any[] = draftId ? (invQ.data?.documents ?? []) : (stagedQ.data ?? []);
  const status: string = inv?.status ?? "draft";
  // An existing draft is only editable once it has loaded successfully.
  const isDraft = !draftId || (invQ.isSuccess && status === "draft");

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
    mutationFn: () => createFn({ data: { ...payload(), onboarding_session_id: onboardingSessionId } }),
    onSuccess: (row: any) => {
      refresh();
      setDraftId(row.id);
      toast.success("Draft saved. You can keep editing it until you send.");
      nav({ to: "/admin/invitations/talent/$id", params: { id: row.id }, replace: true });
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't save the draft.")),
  });
  const updateM = useMutation({
    mutationFn: () => updateFn({ data: { id: draftId, ...payload() } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft updated.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't update the draft.")),
  });

  const sendResult = (res: any, okMsg: string) => {
    refresh();
    if (res?.email_sent) toast.success(okMsg);
    else toast.warning(EMAIL_FALLBACK_NOTICE, { duration: 9000 });
  };

  const finalizeM = useMutation({
    mutationFn: async () => {
      await updateFn({ data: { id: draftId, ...payload() } });
      // The approved email wording is stored with the invitation first.
      await saveWordingFn({ data: { kind: "talent", id: draftId, wording } });
      return finalizeFn({ data: { id: draftId, expiry_days: expiryDays } });
    },
    onSuccess: (res: any) => {
      sendResult(res, "Invitation sent. The talent will receive the branded email.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't send the invitation.")),
  });
  const resendM = useMutation({
    mutationFn: () => resendFn({ data: { id: draftId, extend_days: 14 } }),
    onSuccess: (res: any) => sendResult(res, "Invitation resent · expiry refreshed · logged."),
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't resend the invitation.")),
  });
  const revokeM = useMutation({
    mutationFn: () => revokeFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      toast.success("Invitation revoked. The ID document and proof of talent were deleted.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't revoke the invitation.")),
  });
  const deleteDraftM = useMutation({
    mutationFn: () => deleteDraftFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft and its documents deleted.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't delete the draft.")),
  });
  const deleteDocM = useMutation({
    mutationFn: (id: string) => (draftId ? deleteDocFn({ data: { id } }) : deleteStagedFn({ data: { id } })),
    onSuccess: () => {
      if (draftId) invQ.refetch();
      else stagedQ.refetch();
      refresh();
      toast.success("Document removed.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't remove the document.")),
  });

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});

  async function uploadForSlot(slotKey: string, file: File) {
    const norm = (n: string) => n.trim().toLowerCase();
    if (docs.some((d) => norm(d.file_name ?? "") === norm(file.name))) {
      setSlotErrors((p) => ({
        ...p,
        [slotKey]: `A document named "${file.name}" has already been uploaded for this invitation.`,
      }));
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
      let path: string;
      if (draftId) {
        path = `${draftId}/${slotKey}/${Date.now()}-${safe}`;
      } else {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (!uid) throw new Error("Please sign in again to upload.");
        path = `staging/${uid}/${onboardingSessionId}/${slotKey}/${Date.now()}-${safe}`;
      }
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      if (draftId) {
        await recordFn({
          data: {
            invitation_id: draftId,
            doc_slot: slotKey as any,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type,
            size_bytes: file.size,
          },
        });
        invQ.refetch();
      } else {
        await stageFn({
          data: {
            kind: "talent",
            session_id: onboardingSessionId,
            doc_slot: slotKey,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type,
          },
        }).finally(() => stagedQ.refetch());
      }
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
      toast.error(friendlyError(e, "We couldn't open that document."));
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

  const uploaded = new Set(docs.filter((d) => !quarantineReason(d)).map((d) => d.doc_slot));
  const missing = SLOTS.filter((s) => !uploaded.has(s.key));
  const emailCheck = useInviteEmailCheck("admin_talent", draftId || null);
  const saving = createM.isPending || updateM.isPending;
  const canSend =
    !!draftId &&
    isDraft &&
    detailsComplete &&
    missing.length === 0 &&
    !saving &&
    !emailCheck.conflict &&
    !invQ.isFetching &&
    !finalizeM.isPending;
  const merge = useMemo(
    () => ({
      talentName: name.trim(),
      recipientEmail: email.trim(),
      adminName: ctxQ.data?.adminName ?? "",
      expiryDate: previewExpiry(expiryDays),
      inviteUrl: ctxQ.data?.inviteUrl ?? "",
    }),
    [name, email, expiryDays, ctxQ.data?.adminName, ctxQ.data?.inviteUrl],
  );
  const reviewBlocked =
    ctxQ.isLoading ||
    missingMergeFields("talent", merge).length > 0 ||
    (wording !== null && wordingIssues(wording).length > 0);
  const saveWordingM = useMutation({
    mutationFn: async () => {
      await updateFn({ data: { id: draftId, ...payload() } });
      return saveWordingFn({ data: { kind: "talent", id: draftId, wording } });
    },
    onSuccess: () => {
      refresh();
      toast.success("Draft saved, including your email wording.");
    },
    onError: (e: any) => toast.error(friendlyError(e, "We couldn't save the draft.")),
  });

  const outstanding = [
    ...(detailsComplete ? [] : ["talent details"]),
    ...missing.map((s) => s.label.toLowerCase()),
  ];

  return (
    <>
      {askConfirmDialog}
      <div className="tvp-topbar">
        <div>
          <Link
            to="/admin/invitations"
            className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {!draftId ? "New invitation" : isDraft ? "Continue invitation" : "Talent invitation"}
          </h1>
          <div className="tvp-subtitle">
            Independent talent join TalVault without an agency. Save a draft at any point;
            everything stays editable until you send.
          </div>
        </div>
        {draftId && invQ.isSuccess && status !== "draft" && (
          <div className="tvp-actions" data-tour="admin-talent-invite-actions">
            <span className="tvp-status tvp-blue">{statusLabel[status] ?? status}</span>
            <Link
              to="/admin/invitations/$id/email-preview"
              params={{ id: draftId }}
              search={{ type: "talent" }}
              className="tvp-secondary"
            >
              <Mail className="h-4 w-4" />
              View sent email
            </Link>
            {status === "pending" && (
              <>
                <button className="tvp-secondary" onClick={copyLink}>
                  <Link2 className="h-4 w-4" />
                  Copy invite link
                </button>
                <button
                  className="tvp-secondary"
                  disabled={resendM.isPending}
                  onClick={() => resendM.mutate()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Resend
                </button>
                <button
                  className="tvp-secondary"
                  disabled={revokeM.isPending}
                  onClick={async () => {
                    if (
                      await askConfirm({
                        title: `Revoke the invitation to ${name}?`,
                        body: "Their ID document and proof of talent will be deleted.",
                        destructive: true,
                      })
                    )
                      revokeM.mutate();
                  }}
                >
                  <Ban className="h-4 w-4" />
                  Revoke
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {step === "review" && isDraft ? (
        <div className="tvp-card tvp-panel">
          <InviteSteps current="review" />
          <InviteEmailReview
            kind="talent"
            merge={merge}
            value={wording}
            onChange={setWording}
            onFix={() => setStep("details")}
          />
          <div className="tvp-footer-actions">
            <button type="button" className="tvp-secondary" onClick={() => setStep("details")}>
              Back to details
            </button>
            <button
              type="button"
              className="tvp-secondary"
              disabled={saveWordingM.isPending || reviewBlocked}
              onClick={() => saveWordingM.mutate()}
            >
              {saveWordingM.isPending ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="tvp-primary"
              disabled={!canSend || reviewBlocked}
              onClick={() => finalizeM.mutate()}
            >
              {finalizeM.isPending ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="tvp-card tvp-panel" data-tour="admin-talent-invite-details">
            {isDraft && <InviteSteps current="details" />}
            {typeSlot ?? (draftId ? <InvitationTypeField value="talent" locked /> : null)}
            <fieldset disabled={!isDraft} style={{ border: "none", padding: 0, margin: 0 }}>
              <div className="tvp-form-group">
                <label>Full name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Thandi Mokoena"
                />
              </div>
              <div className="tvp-form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    emailCheck.clear();
                  }}
                  onBlur={() => void emailCheck.check(email)}
                  aria-invalid={!!emailCheck.conflict}
                  placeholder="name@example.com"
                />
                <InviteEmailFieldError conflict={emailCheck.conflict} />
              </div>
              <div className="tvp-form-group">
                <label>Talent type</label>
                <select value={talentType} onChange={(e) => setTalentType(e.target.value)}>
                  <option value="">Not specified</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tvp-form-group">
                <label>Date of birth *</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  aria-invalid={!!dobError || undefined}
                />
                {dobError && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tvp-red)" }}>
                    {dobError}
                  </div>
                )}
              </div>
              <div className="tvp-form-group">
                <label>Invitation expiry (days)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value) || 14)}
                />
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
                      onClick={async () => {
                        if (
                          await askConfirm({
                            title: "Delete this draft and its documents?",
                            body: "This cannot be undone.",
                            destructive: true,
                          })
                        )
                          deleteDraftM.mutate();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete draft
                    </button>
                  )}
                  <Link to="/admin/invitations" className="tvp-secondary">
                    {draftId ? "Close" : "Cancel"}
                  </Link>
                  <button
                    className="tvp-primary"
                    type="button"
                    disabled={!detailsComplete || saving}
                    onClick={async () => {
                      if (await emailCheck.check(email)) return;
                      if (draftId) updateM.mutate();
                      else createM.mutate();
                    }}
                  >
                    {saving ? "Saving…" : draftId ? "Save draft" : "Save draft & continue →"}
                  </button>
                </div>
                {!detailsComplete && (
                  <p
                    className="tvp-muted"
                    style={{ fontSize: 12, textAlign: "right", marginTop: 6 }}
                  >
                    Add a full name, email and date of birth (18 or older) to save a draft.
                  </p>
                )}
              </>
            )}
          </div>

          {(isDraft || docs.length > 0) && (
            <div
              className="tvp-card tvp-panel"
              style={{ marginTop: 16 }}
              data-tour="admin-talent-invite-docs"
            >
              <h2 className="tvp-h2">Documents</h2>
              <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                One file per slot. Both are required before the invitation can be sent. Documents
                are stored privately, are visible only to administrators, and are deleted if the
                invitation is revoked or expires.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {SLOTS.map((slot) => {
                  const files = docs.filter((d) => d.doc_slot === slot.key);
                  const has = files.some((f) => !quarantineReason(f));
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {has ? (
                            <CheckCircle2
                              className="h-4 w-4"
                              style={{ color: "var(--tvp-green)" }}
                            />
                          ) : (
                            <AlertCircle
                              className="h-4 w-4"
                              style={{ color: "var(--tvp-amber)" }}
                            />
                          )}
                          <strong style={{ fontSize: 14 }}>{slot.label}</strong>
                          <span className="tvp-muted" style={{ fontSize: 12 }}>
                            {has ? "Uploaded" : "Required"}
                          </span>
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
                        <p
                          role="alert"
                          style={{ margin: "8px 0 0", fontSize: 12, color: "var(--tvp-red)" }}
                        >
                          {slotErrors[slot.key]}
                        </p>
                      )}
                      {files.map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            padding: "6px 0 0",
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" style={{ color: "var(--tvp-muted)" }} />
                          {draftId && !quarantineReason(u) ? (
                            <button type="button" className="tvp-link" onClick={() => openDoc(u.id)}>
                              {u.file_name}
                            </button>
                          ) : (
                            <span>{u.file_name}</span>
                          )}
                          <BlockedDocumentPill reason={quarantineReason(u)} />
                          <span className="tvp-muted" style={{ fontSize: 11 }}>
                            {u.size_bytes ? `${Math.round(u.size_bytes / 1024)} KB` : ""}
                          </span>
                          {isDraft && (
                            <button
                              className="tvp-mini-btn"
                              title="Remove"
                              style={{ marginLeft: "auto" }}
                              onClick={() => deleteDocM.mutate(u.id)}
                            >
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
                    <Link to="/admin/invitations" className="tvp-secondary">
                      Save & close
                    </Link>
                    <button
                      type="button"
                      className="tvp-primary"
                      disabled={!canSend}
                      onClick={() => setStep("review")}
                    >
                      Continue to review email
                    </button>
                  </div>
                  {!canSend && outstanding.length > 0 && (
                    <p
                      className="tvp-muted"
                      style={{ fontSize: 12, textAlign: "right", marginTop: 6 }}
                    >
                      Still outstanding: {outstanding.join(", ")}.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
