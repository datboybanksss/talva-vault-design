import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Save, Check, Info, Upload, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/invitations/new")({
  head: () => ({ meta: [{ title: "Invite Agency · TalVault Admin" }] }),
  component: InviteWizard,
});

const STEPS = [
  { title: "Agency Details", sub: "Provide basic agency information" },
  { title: "Main Contact", sub: "Add primary contact information" },
  { title: "Compliance Documents", sub: "Upload required documents" },
  { title: "Review & Send", sub: "Review invitation and send to agency" },
];

function InviteWizard() {
  const [step, setStep] = useState(1);
  const pct = Math.min(100, step * 25);
  const done = step === 5;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/agencies" className="tvp-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ChevronLeft className="h-4 w-4" />Back to Agencies
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 10 }}>Invite Agency</h1>
          <div className="tvp-subtitle">Invite a new agency to join TalVault and start collaborating securely.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary"><Save className="h-4 w-4" />Save as Draft</button>
        </div>
      </div>

      <div className="tvp-card tvp-wizard">
        <div className="tvp-stepper">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const cls = n === step ? " tvp-active" : n < step ? " tvp-done" : "";
            return (
              <div className={`tvp-step${cls}`} key={s.title}>
                <div className="tvp-step-num">{n < step ? <Check className="h-4 w-4" /> : n}</div>
                <div>
                  <div className="tvp-step-title">{s.title}</div>
                  <div className="tvp-step-sub">{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="tvp-form-layout">
          <div className="tvp-card tvp-form-card">
            {step === 1 && (
              <>
                <h2 className="tvp-h2">Agency Information</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>Provide the basic details of the agency.</p>
                <div className="tvp-form-group"><label>Agency Name *</label><input defaultValue="Mbeki Sports Management" /></div>
                <div className="tvp-form-grid">
                  <div className="tvp-form-group"><label>Agency Type *</label><select><option>Sports Agency</option><option>Arts Agency</option><option>Talent Agency</option></select></div>
                  <div className="tvp-form-group"><label>Registration Number *</label><input defaultValue="2026/045678/07" /></div>
                  <div className="tvp-form-group"><label>Registration Date *</label><input defaultValue="12 May 2026" /></div>
                </div>
                <div className="tvp-sub-card">
                  <h3 className="tvp-h3">Registered Address *</h3>
                  <div className="tvp-form-grid">
                    <div className="tvp-form-group"><label>Address Line 1</label><input defaultValue="12 Rosebank Avenue" /></div>
                    <div className="tvp-form-group"><label>Address Line 2</label><input defaultValue="Suite 5" /></div>
                    <div className="tvp-form-group"><label>City / Town</label><input defaultValue="Johannesburg" /></div>
                    <div className="tvp-form-group"><label>Province</label><input defaultValue="Gauteng" /></div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="tvp-h2">Main Contact</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>This person receives the invitation and activates the Agency workspace.</p>
                <div className="tvp-form-grid">
                  <div className="tvp-form-group"><label>First Name *</label><input defaultValue="Thandi" /></div>
                  <div className="tvp-form-group"><label>Surname *</label><input defaultValue="Ndlovu" /></div>
                  <div className="tvp-form-group"><label>Email Address *</label><input defaultValue="thandi@mbekisports.co.za" /></div>
                  <div className="tvp-form-group"><label>Mobile Number</label><input defaultValue="+27 82 555 0147" /></div>
                </div>
                <div className="tvp-callout">
                  <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
                  <div>
                    <strong>Activation rule</strong>
                    <div className="tvp-muted" style={{ fontSize: 13, marginTop: 2 }}>
                      The Agency contact must activate using this email, accept the Terms & Conditions and create a password.
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="tvp-h2">Compliance Documents</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>Documents are reviewed by Admin before the invitation is sent.</p>
                <div className="tvp-upload-box tvp-complete">
                  <div className="tvp-small-icon tvp-bg-green"><Check className="h-4 w-4" /></div>
                  <div><strong>CIPC Registration Document</strong><br /><span className="tvp-muted">Uploaded · CIPC_Mbeki_Sports.pdf</span></div>
                  <button className="tvp-secondary">Replace</button>
                </div>
                <div className="tvp-upload-box tvp-complete">
                  <div className="tvp-small-icon tvp-bg-green"><Check className="h-4 w-4" /></div>
                  <div><strong>Director ID — Thandi Ndlovu</strong><br /><span className="tvp-muted">Uploaded · Director_ID_Thandi.pdf</span></div>
                  <button className="tvp-secondary">Replace</button>
                </div>
                <div className="tvp-upload-box">
                  <div className="tvp-small-icon tvp-bg-amber"><Upload className="h-4 w-4" /></div>
                  <div><strong>Additional Director ID</strong><br /><span className="tvp-muted">Upload if applicable</span></div>
                  <button className="tvp-secondary">Upload</button>
                </div>
                <div className="tvp-form-group"><label>Admin Review Notes</label><textarea defaultValue="CIPC and primary director ID reviewed. No issues identified." /></div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="tvp-h2">Review & Send</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>Confirm before sending the invitation.</p>
                <div className="tvp-review-grid" style={{ marginTop: 14 }}>
                  {[
                    ["Agency", "Mbeki Sports Management"],
                    ["Main Contact", "Thandi Ndlovu"],
                    ["CIPC Document", "Uploaded and reviewed"],
                    ["Director ID", "Uploaded and reviewed"],
                  ].map(([k, v]) => (
                    <div className="tvp-review-item" key={k}>
                      <div className="tvp-meta-label">{k}</div>
                      <div className="tvp-meta-value">{v}</div>
                      <span className="tvp-status tvp-green">Complete</span>
                    </div>
                  ))}
                </div>
                <div className="tvp-callout" style={{ marginTop: 18 }}>
                  <div className="tvp-callout-icon"><Check className="h-4 w-4" /></div>
                  <div>
                    <strong>Ready to send</strong>
                    <div className="tvp-muted" style={{ fontSize: 13, marginTop: 2 }}>
                      Once sent, the Agency contact receives a secure email invitation. The action will be logged.
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <div className="tvp-success-screen">
                <div className="tvp-small-icon tvp-bg-green" style={{ margin: "auto", width: 64, height: 64 }}>
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h1 className="tvp-h1" style={{ marginTop: 18 }}>Invitation sent</h1>
                <p className="tvp-muted" style={{ marginTop: 8 }}>
                  Mbeki Sports Management has been invited. The status is visible under Agency Invitations.
                </p>
                <div className="tvp-footer-actions" style={{ justifyContent: "center" }}>
                  <Link to="/admin/invitations" className="tvp-primary">View Invitations</Link>
                  <Link to="/admin/agencies" className="tvp-secondary">Back to Agencies</Link>
                </div>
              </div>
            )}

            {!done && (
              <div className="tvp-footer-actions">
                {step > 1 && (
                  <button className="tvp-secondary" onClick={() => setStep((s) => s - 1)}>Back</button>
                )}
                <button
                  className="tvp-primary"
                  onClick={() => setStep((s) => (s === 4 ? 5 : s + 1))}
                >
                  {step === 4 ? "Send Invitation" : "Save & Continue →"}
                </button>
              </div>
            )}
          </div>

          <div className="tvp-card tvp-readiness">
            <h2 className="tvp-h2">Invitation Readiness</h2>
            <div className="tvp-progress-line"><span style={{ width: `${pct}%` }} /></div>
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              <strong>{pct}%</strong> complete · Step {Math.min(step, 4)} of 4
            </p>
            {STEPS.map((s, i) => {
              const n = i + 1;
              const status = n < step ? "done" : n === step ? "active" : "locked";
              return (
                <div className="tvp-checklist" key={s.title}>
                  <strong>{n} · {s.title}</strong>
                  {status === "done" && <span className="tvp-status tvp-green" style={{ marginLeft: 8 }}>Complete</span>}
                  {status === "active" && <span className="tvp-status tvp-blue" style={{ marginLeft: 8 }}>In progress</span>}
                  {status === "locked" && <span className="tvp-muted" style={{ marginLeft: 8 }}> Locked</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
