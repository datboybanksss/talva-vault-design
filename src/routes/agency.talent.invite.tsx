import { FOLDER_CATEGORIES } from "@/lib/folder-taxonomy";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Sparkles,
  Check,
  Settings2,
  ShieldCheck,
  Lock,
} from "lucide-react";
import {
  agencyWhoami,
  listAgencyStaff,
  listAgencyTalent,
  listAgencyFolderSettings,
  createTalentInvitationMine,
} from "@/lib/agency.functions";
import { sendTalentInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_TALENT_INVITATION_SUBJECT,
  DEFAULT_TALENT_INVITATION_BODY,
  EMAIL_FALLBACK_NOTICE,
} from "@/lib/invitation-email";
import { BASELINE_TALENT_TYPES } from "@/lib/status-labels";


export const Route = createFileRoute("/agency/talent/invite")({
  head: () => ({ meta: [{ title: "Invite talent · TalVault" }] }),
  component: InviteTalent,
});

const steps = [
  { num: 1, title: "Talent details", sub: "Create basic profile" },
  { num: 2, title: "Manager", sub: "Assign internal owner" },
  { num: 3, title: "Shared folder", sub: "Choose professional folders" },
  { num: 4, title: "Review & send", sub: "Send invite" },
];

function InviteTalent() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const whoamiFn = useServerFn(agencyWhoami);
  const staffFn = useServerFn(listAgencyStaff);
  const rosterFn = useServerFn(listAgencyTalent);
  const folderSettingsFn = useServerFn(listAgencyFolderSettings);
  const createFn = useServerFn(createTalentInvitationMine);
  const sendEmailFn = useServerFn(sendTalentInvitationEmail);

  const who = useQuery({ queryKey: ["agency", "whoami"], queryFn: () => whoamiFn() });
  const staff = useQuery({ queryKey: ["agency", "staff"], queryFn: () => staffFn() });
  const roster = useQuery({ queryKey: ["agency", "talent"], queryFn: () => rosterFn() });
  const folderSettings = useQuery({
    queryKey: ["agency", "folder-settings"],
    queryFn: () => folderSettingsFn(),
  });
  const isOwner = who.data?.role === "owner";

  // Folder options come from this agency's own configuration (Manage folders);
  // the platform taxonomy is only the baseline before anything is configured.
  const { defaultFolders, allFolders } = useMemo(() => {
    const configured = (folderSettings.data?.settings ?? []) as Array<{
      folder_name: string;
      applied_by_default: boolean;
    }>;
    if (configured.length > 0) {
      const all = configured.map((s) => s.folder_name).sort((a, b) => a.localeCompare(b));
      return {
        defaultFolders: configured.filter((s) => s.applied_by_default).map((s) => s.folder_name),
        allFolders: all,
      };
    }
    return {
      defaultFolders: FOLDER_CATEGORIES.filter((f) => f.recommended).map((f) => f.name),
      allFolders: FOLDER_CATEGORIES.map((f) => f.name),
    };
  }, [folderSettings.data]);

  // Talent types the agency already uses, so the list grows with real data.
  const talentTypeOptions = useMemo(() => {
    const live = ((roster.data ?? []) as Array<{ talentType: string | null }>)
      .map((r) => r.talentType)
      .filter((t): t is string => !!t && t.trim().length > 0);
    return Array.from(new Set([...live, ...BASELINE_TALENT_TYPES])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [roster.data]);

  const [step, setStep] = useState(1);
  const [folderMode, setFolderMode] = useState<"standard" | "custom">("standard");
  const [selected, setSelected] = useState<string[] | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [talentType, setTalentType] = useState("");
  const [expiryDays, setExpiryDays] = useState(14);
  const [managerId, setManagerId] = useState("");

  const staffList = (staff.data ?? []) as Array<{ userId: string; name: string; role: string }>;
  const managerName = useMemo(
    () => staffList.find((s) => s.userId === managerId)?.name ?? "Not assigned yet",
    [staffList, managerId],
  );

  const customSelection = selected ?? defaultFolders;

  const toggle = (f: string) =>
    setSelected((s) => {
      const base = s ?? defaultFolders;
      return base.includes(f) ? base.filter((x) => x !== f) : [...base, f];
    });

  const activeFolders = folderMode === "standard" ? defaultFolders : customSelection;

  const detailsValid = fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(email.trim());

  const sendMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          talent_name: fullName.trim(),
          email: email.trim(),
          expiry_days: expiryDays,
          folder_mode: folderMode,
          folder_selection: activeFolders.map((name, i) => ({ name, sort_order: i })),
          manager_user_id: managerId || null,
          talent_type: talentType || null,
        },
      }),
    onSuccess: async (inv: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
      qc.invalidateQueries({ queryKey: ["agency", "talent"] });

      // Actually send the invitation email. A delivery failure must not lose
      // the invitation — it already exists and the link can be copied.
      let sent = false;
      let reason: string | undefined;
      try {
        const res: any = await sendEmailFn({
          data: {
            id: inv.id,
            subject: DEFAULT_TALENT_INVITATION_SUBJECT,
            body: DEFAULT_TALENT_INVITATION_BODY,
            invite_url: `${window.location.origin}/invite/talent/${inv.token}`,
          },
        });
        sent = !!res?.sent;
        reason = res?.reason;
      } catch (e: any) {
        reason = e?.message;
      }

      if (sent) {
        toast.success("Invitation sent. The link expires on the date you set.");
      } else {
        toast.warning(
          reason === "domain_unverified" || reason === "email_not_configured"
            ? EMAIL_FALLBACK_NOTICE
            : "Invitation created, but the email could not be sent. Copy the link and send it yourself for now.",
          { duration: 9000 },
        );
      }
      navigate({ to: "/agency/invitations" });
    },
    onError: (e: any) => toast.error(e?.message ?? "The invitation could not be sent."),
  });

  const canContinue = step !== 1 || detailsValid;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/agency/talent" className="tvp-link inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back to talent</Link>
          <h1 className="tvp-h1 mt-2">Invite talent</h1>
          <div className="tvp-subtitle">Create a talent profile and send a secure invitation.</div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-stepper">
          {steps.map((s) => (
            <div key={s.num} className={`tvp-step${step === s.num ? " tvp-active" : step > s.num ? " tvp-done" : ""}`}>
              <div className="tvp-step-num">{s.num}</div>
              <div>
                <div className="tvp-step-title">{s.title}</div>
                <div className="tvp-step-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="tvp-form-layout">
          <div>
            {step === 1 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Talent details</h3>
                <div className="tvp-form-grid">
                  <div className="tvp-form-group">
                    <label>Full legal name *</label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. full name as it appears on ID"
                    />
                  </div>
                  <div className="tvp-form-group">
                    <label>Email address *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@email.com"
                    />
                  </div>
                  <div className="tvp-form-group">
                    <label>Talent type</label>
                    <select value={talentType} onChange={(e) => setTalentType(e.target.value)}>
                      <option>Athlete</option>
                      <option>Artist</option>
                      <option>Model</option>
                    </select>
                  </div>
                  <div className="tvp-form-group">
                    <label>Invitation expiry (days)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(Math.max(1, Math.min(60, Number(e.target.value) || 14)))}
                    />
                  </div>
                </div>
                {!detailsValid && (
                  <div className="tvp-small tvp-muted" style={{ marginTop: 8 }}>
                    A full name and a valid email address are needed before you can continue.
                  </div>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Assign agency manager</h3>
                <p className="tvp-muted">The manager is the internal owner of this talent relationship.</p>
                <div className="tvp-form-group">
                  <label>Manager</label>
                  <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                    <option value="">Not assigned yet</option>
                    {staffList.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.name}{s.role === "owner" ? " (owner)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {staff.isLoading && <div className="tvp-small tvp-muted">Loading your team…</div>}
                {!staff.isLoading && staffList.length === 0 && (
                  <div className="tvp-small tvp-muted">
                    No team members yet — invite a colleague from Invitations, or leave this unassigned for now.
                  </div>
                )}
              </div>
            )}
            {step === 3 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Roster shared folder setup</h3>
                <div
                  className="tvp-ai-box"
                  style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="tvp-small">
                    Roster Shared Folder is visible to both you and the talent. It is separate
                    from the talent's Private Vault, which only they can see.
                  </div>
                </div>

                <div className="tvp-onboard-choice" style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => setFolderMode("standard")}
                    className={`tvp-rule-card ${folderMode === "standard" ? "tvp-active" : ""}`}
                    style={{ textAlign: "left", flexDirection: "column", alignItems: "stretch", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Check className="h-4 w-4" /> Use my standard set
                      </strong>
                      <span className="tvp-small tvp-muted">Recommended</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {defaultFolders.map((f) => (
                        <span key={f} className="tvp-badge">{f}</span>
                      ))}
                    </div>
                    <div className="tvp-small tvp-muted" style={{ marginTop: 8 }}>
                      One click. Same six folders you use across the roster.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFolderMode("custom")}
                    className={`tvp-rule-card ${folderMode === "custom" ? "tvp-active" : ""}`}
                    style={{ textAlign: "left", flexDirection: "column", alignItems: "stretch", cursor: "pointer" }}
                  >
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Settings2 className="h-4 w-4" /> Customise for this talent
                    </strong>
                    <div className="tvp-small tvp-muted" style={{ marginTop: 8 }}>
                      Pick and choose folders. Useful for atypical engagements.
                    </div>
                  </button>
                </div>

                {folderMode === "custom" && (
                  <div className="tvp-rule-grid" style={{ marginTop: 16 }}>
                    {allFolders.map((f) => {
                      const on = selected.includes(f);
                      const rec = defaultFolders.includes(f);
                      return (
                        <label key={f} className="tvp-rule-card">
                          <span>
                            <input type="checkbox" checked={on} onChange={() => toggle(f)} /> {f}
                          </span>
                          <span className="tvp-small">{rec ? "Recommended" : "Optional"}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {step === 4 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Review & send</h3>
                <div className="tvp-review-grid" style={{ marginTop: 14 }}>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Talent</span><strong>{fullName.trim() || "—"}</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Email</span><strong>{email.trim() || "—"}</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Talent type</span><strong>{talentType}</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Manager</span><strong>{managerName}</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Invitation expiry</span><strong>{expiryDays} days</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Folders</span><strong>{activeFolders.length} enabled{folderMode === "standard" ? " (standard set)" : " (custom)"}</strong></div>
                </div>
                <div className="tvp-ai-box" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="tvp-small">
                    The talent's Private Vault stays private — nothing you configure here grants access to it.
                  </div>
                </div>
                <div className="tvp-ai-box" style={{ marginTop: 16 }}>
                  <strong><Sparkles className="inline h-4 w-4 mr-1" />What happens next</strong>
                  <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
                    The talent receives a secure invitation link. Their shared folders are created
                    when they accept. Sending is recorded in your activity log.
                  </p>
                </div>
                {!isOwner && (
                  <div className="tvp-small tvp-muted" style={{ marginTop: 10 }}>
                    Only the agency owner can send talent invitations.
                  </div>
                )}
              </div>
            )}

            <div className="tvp-footer-actions">
              {step > 1 && <button className="tvp-secondary" onClick={() => setStep(step - 1)}>Back</button>}
              {step < 4 ? (
                <button
                  className="tvp-primary"
                  disabled={!canContinue}
                  onClick={() => canContinue && setStep(step + 1)}
                >
                  Continue
                </button>
              ) : (
                <button
                  className="tvp-primary"
                  disabled={!detailsValid || !isOwner || sendMut.isPending}
                  onClick={() => sendMut.mutate()}
                >
                  <Send className="h-4 w-4" />
                  {sendMut.isPending ? "Sending…" : "Send invitation"}
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="tvp-card tvp-panel">
              <h3 className="tvp-h3">Invitation checklist</h3>
              <div className="tvp-checklist-row">{detailsValid ? "✓" : "○"} Talent details</div>
              <div className="tvp-checklist-row">{managerId ? "✓" : "○"} Manager assigned</div>
              <div className="tvp-checklist-row">{activeFolders.length > 0 ? "✓" : "○"} Folders chosen</div>
              <div className="tvp-checklist-row">{sendMut.isSuccess ? "✓" : "○"} Sent</div>
            </div>
            <div className="tvp-help-note">
              The talent must register with the same email used in the invitation.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
