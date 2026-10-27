import {
  duplicateOnboardingName,
  onboardingPanelDocuments,
  onboardingSession,
  rememberOnboardingSession,
} from "@/lib/onboarding-documents";
import { BlockedOnboardingDocument } from "@/components/shared/blocked-onboarding-document";
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
import { SITE_LINK_MISSING_MESSAGE } from "@/lib/brand-email";
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
import { getRegistrationCopy } from "@/lib/registration-copy.functions";
import { DOCUMENT_ACCEPT, preflightUpload } from "@/lib/file-validation";
import { friendlyError } from "@/lib/friendly-error";

const BUCKET = "talent-invite-docs";
const SLOTS = [{ key: "proof_of_talent" }] as const;

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
 * draft flow: details → draft → proof of talent → send.
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
  const [onboardingSessionId] = useState(() => onboardingSession(initialId));

  const [draftId, setDraftId] = useState(initialId ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [talentType, setTalentType] = useState("");
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
  const inv = invQ.data?.invitation;
  const stagedQ = useQuery({
    queryKey: ["admin", "staged", "talent", onboardingSessionId],
    queryFn: () => listStagedFn({ data: { kind: "talent", session_id: onboardingSessionId } }),
  });
  const docs = onboardingPanelDocuments(
    draftId ? (invQ.data?.documents ?? []) : null,
    stagedQ.data ?? [],
  );
  const status: string = inv?.status ?? "draft";
  // An existing draft is only editable once it has loaded successfully.
  const isDraft = !draftId || (invQ.isSuccess && status === "draft");

  useEffect(() => {
    if (!inv) return;
    setName(inv.talent_name ?? "");
    setEmail(inv.email ?? "");
    setTalentType(inv.talent_type ?? "");
    setExpiryDays(daysUntil(inv.expires_at));
  }, [inv?.id]);

  const catalogue = useFolderCatalogue();
  const typeOptions = useMemo(() => {
    const list = talentTypesFrom(catalogue);
    return talentType && !list.includes(talentType) ? [talentType, ...list] : list;
  }, [catalogue, talentType]);

  const copyQ = useQuery({
    queryKey: ["talent-registration-copy"],
    queryFn: () => getRegistrationCopy(),
  });
  const copy = copyQ.data;
  const detailsComplete = !!(name.trim().length >= 2 && email.trim());
  const payload = () => ({ talent_name: name, email, talent_type: talentType });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const createM = useMutation({
    mutationFn: () =>
      createFn({ data: { ...payload(), onboarding_session_id: onboardingSessionId } }),
    onSuccess: (row) => {
      refresh();
      rememberOnboardingSession(row.id, onboardingSessionId);
      setDraftId(row.id);
      toast.success("Draft saved. You can keep editing it until you send.");
      nav({ to: "/admin/invitations/talent/$id", params: { id: row.id }, replace: true });
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't save the draft.")),
  });
  const updateM = useMutation({
    mutationFn: () => updateFn({ data: { id: draftId, ...payload() } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft updated.");
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't update the draft.")),
  });

  const sendResult = (
    res:
      | Awaited<ReturnType<typeof finalizeIndependentTalentInvitation>>
      | Awaited<ReturnType<typeof resendIndependentTalentInvitation>>,
    okMsg: string,
  ) => {
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
    onSuccess: (res) => {
      sendResult(res, "Invitation sent. The talent will receive the branded email.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't send the invitation.")),
  });
  const resendM = useMutation({
    mutationFn: () => resendFn({ data: { id: draftId, extend_days: 14 } }),
    onSuccess: (res) => sendResult(res, "Invitation resent · expiry refreshed · logged."),
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't resend the invitation.")),
  });
  const revokeM = useMutation({
    mutationFn: () => revokeFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      if (copy) toast.success(copy.revoked_notice);
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't revoke the invitation.")),
  });
  const deleteDraftM = useMutation({
    mutationFn: () => deleteDraftFn({ data: { id: draftId } }),
    onSuccess: () => {
      refresh();
      toast.success("Draft and its documents deleted.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't delete the draft.")),
  });
  const deleteDocM = useMutation({
    mutationFn: (id: string) =>
      stagedQ.data?.some((row) => row.id === id)
        ? deleteStagedFn({ data: { id } })
        : deleteDocFn({ data: { id } }),
    onSuccess: () => {
      if (draftId) invQ.refetch();
      stagedQ.refetch();
      refresh();
      toast.success("Document removed.");
    },
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't remove the document.")),
  });

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});

  async function uploadForSlot(slotKey: (typeof SLOTS)[number]["key"], file: File) {
    if (duplicateOnboardingName(docs, file.name)) {
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
            doc_slot: slotKey,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type,
            size_bytes: file.size,
            onboarding_session_id: onboardingSessionId,
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
    } catch (e: unknown) {
      setSlotErrors((p) => ({
        ...p,
        [slotKey]: friendlyError(e, "Upload failed"),
      }));
    } finally {
      void stagedQ.refetch();
      setUploadingSlot(null);
    }
  }

  const openDoc = async (id: string) => {
    try {
      const { url } = await docUrlFn({ data: { id } });
      window.open(url, "_blank", "noopener");
    } catch (e: unknown) {
      toast.error(friendlyError(e, "We couldn't open that document."));
    }
  };

  const copyLink = async () => {
    const url = invQ.data?.invite_url;
    if (!url) {
      if (invQ.data?.invite_link_unavailable) toast.error(SITE_LINK_MISSING_MESSAGE);
      return;
    }
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
    !!copy &&
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
    onError: (e: unknown) => toast.error(friendlyError(e, "We couldn't save the draft.")),
  });

  const outstanding = [
    ...(detailsComplete ? [] : ["talent details"]),
    ...missing.map(() => copy?.proof_label.toLowerCase() ?? ""),
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
                        body: copy?.revoke_help ?? "",
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
                    {copy?.draft_help}
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
                {copy?.documents_help}
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
                          <strong style={{ fontSize: 14 }}>{copy?.proof_label}</strong>
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
                            <button
                              type="button"
                              className="tvp-link"
                              onClick={() => openDoc(u.id)}
                            >
                              {u.file_name}
                            </button>
                          ) : (
                            <span>{u.file_name}</span>
                          )}
                          <BlockedOnboardingDocument reason={quarantineReason(u)} />
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
