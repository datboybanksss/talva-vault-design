import { createFileRoute } from "@tanstack/react-router";
import { Lock, X, Copy, Mail } from "lucide-react";

export const Route = createFileRoute("/modal-preview")({ component: Preview });

function Preview() {
  return (
    <div className="tv-app">
      <div className="tvp-modal-backdrop">
        <div className="tvp-modal" style={{ maxWidth: 480 }}>
          <div className="tvp-modal-head">
            <h2 className="tvp-h2"><Lock className="h-4 w-4" /> Access code</h2>
            <button title="Close" className="tvp-mini-btn" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="tvp-modal-body">
            <div className="tvp-secret">
              <div className="tvp-secret-head">Shown once — copy it now</div>
              <div className="tvp-secret-body">
                <code className="tvp-secret-code">7K4M2Q</code>
                <button className="tvp-primary"><Copy className="h-4 w-4" /> Copy</button>
              </div>
              <p className="tvp-secret-note">
                Send this to Sarah Mokoena <strong>separately from the link</strong> — by phone or message.
                We never include it in email. If it's lost, issue a new code from the table.
              </p>
            </div>
            <div style={{ marginTop: 18 }}>
              <span className="tvp-field-label">Magic link</span>
              <div className="tvp-link-row">
                <input readOnly value="https://talvault.app/loved-one/8f2c9ab1" aria-label="Share link" />
                <button className="tvp-secondary"><Copy className="h-4 w-4" /> Copy link</button>
              </div>
            </div>
            <div className="tvp-status-line">
              <Mail className="h-3.5 w-3.5" style={{ flex: "0 0 auto", marginTop: 2 }} />
              <span>New code issued. The link is unchanged.</span>
            </div>
          </div>
          <div className="tvp-modal-foot">
            <button className="tvp-primary">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
