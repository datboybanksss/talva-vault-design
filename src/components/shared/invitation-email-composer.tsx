import { useMemo } from "react";
import { RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import {
  INVITATION_VARIANTS,
  INVITATION_DISCLAIMER,
  INVITATION_FALLBACK_LINK_COPY,
  applyTokens,
  bodyParagraphs,
  type InvitationTokens,
} from "@/lib/invitation-email";

/**
 * Shared compose + live-preview surface for every invitation email flow
 * (agency, talent, administrator). The fixed chrome — strap-line, CTA,
 * fallback link, expiry block, disclaimer and footer — is rendered from the
 * same variant table the real email uses, so the preview cannot drift.
 */
export function InvitationEmailComposer({
  variant,
  subject,
  setSubject,
  body,
  setBody,
  defaultSubject,
  defaultBody,
  recipientEmail,
  inviteUrl,
  expiryDate,
  tokens,
}: {
  variant: "agency" | "talent" | "admin";
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  defaultSubject: string;
  defaultBody: string;
  recipientEmail: string;
  inviteUrl: string;
  expiryDate: string;
  tokens: InvitationTokens;
}) {
  const v = INVITATION_VARIANTS[variant];
  const renderedSubject = useMemo(
    () => applyTokens(subject, tokens),
    [subject, tokens],
  );
  const renderedParas = useMemo(
    () => bodyParagraphs(applyTokens(body, tokens)),
    [body, tokens],
  );

  return (
    <div className="tvp-email-composer">
      {/* Editor */}
      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-title">Compose</div>
        <label className="tvp-label" style={{ display: "block", marginTop: 12 }}>Recipient</label>
        <input className="tvp-input" value={recipientEmail} readOnly />

        <label className="tvp-label" style={{ display: "block", marginTop: 12 }}>Subject</label>
        <input
          className="tvp-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line"
        />

        <label className="tvp-label" style={{ display: "block", marginTop: 12 }}>Message</label>
        <textarea
          className="tvp-input"
          style={{ minHeight: 240, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="tvp-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Blank lines separate paragraphs. The secure button, link and expiry block are always
          appended automatically — you can't remove them.
        </div>
        <button
          className="tvp-secondary"
          style={{ marginTop: 12 }}
          onClick={() => { setSubject(defaultSubject); setBody(defaultBody); }}
        >
          <RotateCcw className="h-4 w-4" />Reset to template
        </button>
      </div>

      {/* Live preview */}
      <div className="tvp-card" style={{ padding: 0, background: "#f4f5f7" }}>
        <div style={{ maxWidth: 600, margin: "24px auto", background: "#ffffff", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: "#1a1f2e" }}>
          <div style={{ background: "#064E58", padding: "28px 32px", color: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TalVaultIcon variant="white" style={{ height: 22, width: 22 }} />
              </div>
              <TalVaultWordmark variant="white" style={{ height: 18 }} />
            </div>
            <h1 data-testid="preview-subject" style={{ fontSize: 22, fontWeight: 700, margin: "22px 0 6px" }}>
              {renderedSubject}
            </h1>
            <p style={{ fontSize: 14, opacity: 0.95, margin: 0 }}>{v.strapline}</p>
          </div>

          <div style={{ padding: "28px 32px" }} data-testid="preview-body">
            {renderedParas.map((p, i) => (
              <p key={i} style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>{p}</p>
            ))}

            <div style={{ textAlign: "center", margin: "24px 0 8px" }}>
              <a
                href={inviteUrl}
                style={{
                  display: "inline-block", background: "#064E58", color: "#ffffff",
                  textDecoration: "none", padding: "13px 28px", borderRadius: 8,
                  fontWeight: 600, fontSize: 15,
                }}
              >
                {v.ctaLabel}
              </a>
            </div>

            <p style={{ fontSize: 13, color: "#5b6478", textAlign: "center", margin: "10px 0 0" }}>
              {INVITATION_FALLBACK_LINK_COPY}
              <br />
              <span style={{ wordBreak: "break-all", color: "#064E58" }}>{inviteUrl}</span>
            </p>

            <div style={{ marginTop: 26, padding: "14px 16px", background: "#f7f8fb", borderRadius: 8, borderLeft: "3px solid #064E58" }}>
              <div style={{ fontSize: 12, color: "#5b6478", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                Expires
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{expiryDate}</div>
              <div style={{ fontSize: 12, color: "#5b6478", marginTop: 6 }}>{v.expiryHelp}</div>
            </div>

            <p style={{ fontSize: 13, color: "#5b6478", lineHeight: 1.55, margin: "24px 0 0" }}>
              {INVITATION_DISCLAIMER}
            </p>
          </div>

          <div style={{ padding: "18px 32px", background: "#0f172a", color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
            <TalVaultWordmark variant="white" style={{ height: 14, marginBottom: 6 }} />
            <div>{v.footerBrand} · Sent to {recipientEmail}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared send-status banner used by all three composer screens. */
export function SendStatusBanner({ status }: { status: { kind: "ok" | "error"; message: string } | null }) {
  if (!status) return null;
  return (
    <div
      className="tvp-card"
      style={{
        display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16,
        borderLeft: `3px solid ${status.kind === "ok" ? "var(--tvp-green)" : "var(--tvp-amber)"}`,
      }}
    >
      {status.kind === "ok"
        ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--tvp-green)", marginTop: 2 }} />
        : <AlertTriangle className="h-4 w-4" style={{ color: "var(--tvp-amber)", marginTop: 2 }} />}
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{status.message}</div>
    </div>
  );
}
