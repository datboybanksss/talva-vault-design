import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Send, Sparkles, Check, Settings2, ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/agency/talent/invite")({
  head: () => ({ meta: [{ title: "Invite Talent · TalVault" }] }),
  component: InviteTalent,
});

const steps = [
  { num: 1, title: "Talent Details", sub: "Create basic profile" },
  { num: 2, title: "Manager", sub: "Assign internal owner" },
  { num: 3, title: "Shared Folder", sub: "Choose professional folders" },
  { num: 4, title: "Review & Send", sub: "Send invite" },
];

const defaultFolders = [
  "ID Documents", "Contracts", "Travel", "Certified Documents", "Tax", "Proof of Accounts",
];
const optionalFolders = ["Property", "Sponsorships"];
const allFolders = [...defaultFolders, ...optionalFolders];

function InviteTalent() {
  const [step, setStep] = useState(1);
  const [folderMode, setFolderMode] = useState<"standard" | "custom">("standard");
  const [selected, setSelected] = useState<string[]>(defaultFolders);

  const toggle = (f: string) =>
    setSelected((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));

  const activeFolders = folderMode === "standard" ? defaultFolders : selected;


  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/agency/talent" className="tvp-link inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back to Talent</Link>
          <h1 className="tvp-h1 mt-2">Invite Talent</h1>
          <div className="tvp-subtitle">Create a Talent profile and send a secure invitation.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Save className="h-4 w-4" />Save as Draft</button>
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
                  <div className="tvp-form-group"><label>Full legal name</label><input placeholder="e.g. Caster Semenya" /></div>
                  <div className="tvp-form-group"><label>Display name</label><input placeholder="How Talent appears in TalVault" /></div>
                  <div className="tvp-form-group"><label>Talent type</label><select><option>Athlete</option><option>Artist</option><option>Model</option></select></div>
                  <div className="tvp-form-group"><label>Country</label><input defaultValue="South Africa" /></div>
                  <div className="tvp-form-group"><label>Email address</label><input placeholder="Used for invitation" /></div>
                  <div className="tvp-form-group"><label>Mobile</label><input placeholder="+27..." /></div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Assign Agency manager</h3>
                <p className="tvp-muted">The manager is the internal owner of this Talent relationship.</p>
                <div className="tvp-form-group"><label>Manager</label><select><option>Thandi Ndlovu (Owner)</option><option>Sipho Dlamini</option><option>Aaliyah Mokoena</option></select></div>
                <div className="tvp-form-group"><label>Secondary manager (optional)</label><select><option>None</option><option>Sipho Dlamini</option></select></div>
              </div>
            )}
            {step === 3 && (
              <div className="tvp-sub-card" style={{ marginTop: 0 }}>
                <h3 className="tvp-h3">Roster Shared Folder setup</h3>
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
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Talent</span><strong>Caster Semenya</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Email</span><strong>caster@example.com</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Manager</span><strong>Thandi Ndlovu</strong></div>
                  <div className="tvp-review-item"><span className="tvp-muted tvp-small">Folders</span><strong>6 enabled</strong></div>
                </div>
                <div className="tvp-ai-box" style={{ marginTop: 16 }}>
                  <strong><Sparkles className="inline h-4 w-4 mr-1" />Invite preview</strong>
                  <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>The Talent will receive a secure invitation email with onboarding steps and folder setup.</p>
                </div>
              </div>
            )}

            <div className="tvp-footer-actions">
              {step > 1 && <button className="tvp-secondary" onClick={() => setStep(step - 1)}>Back</button>}
              {step < 4
                ? <button className="tvp-primary" onClick={() => setStep(step + 1)}>Continue</button>
                : <button className="tvp-primary"><Send className="h-4 w-4" />Send Invitation</button>}
            </div>
          </div>

          <div>
            <div className="tvp-card tvp-panel">
              <h3 className="tvp-h3">Invitation checklist</h3>
              <div className="tvp-checklist-row">{step >= 1 ? "✓" : "○"} Talent details</div>
              <div className="tvp-checklist-row">{step >= 2 ? "✓" : "○"} Manager assigned</div>
              <div className="tvp-checklist-row">{step >= 3 ? "✓" : "○"} Folders chosen</div>
              <div className="tvp-checklist-row">{step >= 4 ? "✓" : "○"} Sent</div>
            </div>
            <div className="tvp-help-note">
              The Talent must register with the same email used in the invitation.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
