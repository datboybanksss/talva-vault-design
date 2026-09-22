import {
  useFolderCatalogue,
  resolveSubfolders,
  talentTypesFrom,
} from "@/lib/folder-catalogue";
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


export const Route = createFileRoute("/agency/talent/invite")({
  head: () => ({ meta: [{ title: "Invite talent · TalVault" }] }),
  component: InviteTalent,
});

/**
 * Two panels only. Manager assignment is deliberately NOT part of inviting —
 * it is a post-acceptance action from the talent roster.
 */
const steps = [
  { num: 1, title: "Talent details", sub: "Create basic profile" },
  { num: 2, title: "Shared folder", sub: "Choose professional folders" },
];

function InviteTalent() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const whoamiFn = useServerFn(agencyWhoami);
  const rosterFn = useServerFn(listAgencyTalent);
  const folderSettingsFn = useServerFn(listAgencyFolderSettings);
  const createFn = useServerFn(createTalentInvitationMine);
  const sendEmailFn = useServerFn(sendTalentInvitationEmail);

  const who = useQuery({ queryKey: ["agency", "whoami"], queryFn: () => whoamiFn() });
  const roster = useQuery({ queryKey: ["agency", "talent"], queryFn: () => rosterFn() });
  const folderSettings = useQuery({
    queryKey: ["agency", "folder-settings"],
    queryFn: () => folderSettingsFn(),
  });
  const isOwner = who.data?.role === "owner";

  // Folder options come from this agency's own configuration (Manage folders);
  // the platform taxonomy is only the baseline before anything is configured.
  const catalogue = useFolderCatalogue();
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
      defaultFolders: catalogue.categories.filter((f) => f.recommended).map((f) => f.name),
      allFolders: catalogue.categories.map((f) => f.name),
    };
  }, [folderSettings.data, catalogue.categories]);

  // Talent types the agency already uses, so the list grows with real data.
  const talentTypeOptions = useMemo(() => {
    const live = ((roster.data ?? []) as Array<{ talentType: string | null }>)
      .map((r) => r.talentType)
      .filter((t): t is string => !!t && t.trim().length > 0);
    return Array.from(new Set([...live, ...talentTypesFrom(catalogue)])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [roster.data, catalogue]);

  const [step, setStep] = useState(1);
  const [folderMode, setFolderMode] = useState<"standard" | "custom">("standard");
  const [selected, setSelected] = useState<string[] | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [talentType, setTalentType] = useState("");
  const [expiryDays, setExpiryDays] = useState(14);

  const customSelection = selected ?? defaultFolders;

  const toggle = (f: string) =>
    setSelected((s) => {
      const base = s ?? defaultFolders;
      return base.includes(f) ? base.filter((x) => x !== f) : [...base, f];
    });

  const activeFolders = folderMode === "standard" ? defaultFolders : customSelection;

  /** Subfolders this category will provision, given the chosen talent type. */
  const subfolderPreview = (categoryName: string) => {
    const cat = catalogue.categories.find((c) => c.name === categoryName);
    if (!cat) return "";
    const subs = resolveSubfolders(catalogue, cat.slug, talentType || null).filter(
      (x) => x.enabled && x.kind === "default",
    );
    if (subs.length === 0) return "";
    return `${subs.length} subfolder${subs.length === 1 ? "" : "s"}: ${subs
      .slice(0, 4)
      .map((x) => x.name)
      .join(", ")}${subs.length > 4 ? "…" : ""}`;
  };

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
                      <option value="">Not specified</option>
                      {talentTypeOptions.map((t) => (
                        <option key={t} value={t}>{t}</option>
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
                      One click. The same {defaultFolders.length} folder{defaultFolders.length === 1 ? "" : "s"} you use across the roster.
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

                <div className="tvp-ai-box" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="tvp-small">
                    The talent's Private Vault stays private — nothing you configure here grants
                    access to it. You can assign an agency manager from the roster once they accept.
                  </div>
                </div>

                {folderMode === "custom" && (
                  <div className="tvp-rule-grid" style={{ marginTop: 16 }}>
                    {allFolders.map((f) => {
                      const on = customSelection.includes(f);
                      const rec = defaultFolders.includes(f);
                      return (
                        <label key={f} className="tvp-rule-card" style={{ alignItems: "flex-start" }}>
                          <span>
                            <input type="checkbox" checked={on} onChange={() => toggle(f)} /> {f}
                            {on && (
                              <span
                                className="tvp-small tvp-muted"
                                style={{ display: "block", marginTop: 4 }}
                              >
                                {subfolderPreview(f)}
                              </span>
                            )}
                          </span>
                          <span className="tvp-small">{rec ? "Recommended" : "Optional"}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="tvp-footer-actions">
              {step > 1 && <button className="tvp-secondary" onClick={() => setStep(step - 1)}>Back</button>}
              {step < 2 ? (
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
            <div className="tvp-help-note">
              The talent must register with the same email used in the invitation.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
