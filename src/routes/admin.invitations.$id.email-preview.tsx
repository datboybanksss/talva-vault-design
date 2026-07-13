import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getInvitationById } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/invitations/$id/email-preview")({
  head: () => ({ meta: [{ title: "Invitation email preview · TalVault Admin" }] }),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const { id } = useParams({ from: "/admin/invitations/$id/email-preview" });
  const getFn = useServerFn(getInvitationById);
  const q = useQuery({
    queryKey: ["admin", "invitation", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const inv = q.data as any;

  const inviteUrl = inv
    ? `${typeof window !== "undefined" ? window.location.origin : "https://talvault.app"}/invite/${inv.token}`
    : "";
  const expiryDate = inv
    ? new Date(inv.expires_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/invitations" className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>Invitation email preview</h1>
          <div className="tvp-subtitle">
            This is the exact branded email the recipient receives. Unique secure link, expiry included, no password.
          </div>
        </div>
      </div>

      {q.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}
      {!q.isLoading && !inv && <div className="tvp-card tvp-muted">Invitation not found.</div>}
      {inv && (
        <div className="tvp-card" style={{ padding: 0, background: "#f4f5f7" }}>
          {/* Email frame — mimics inbox render. Uses inline styles because real emails cannot rely on external CSS. */}
          <div style={{ maxWidth: 600, margin: "24px auto", background: "#ffffff", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: "#1a1f2e" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", padding: "28px 32px", color: "#ffffff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldCheck className="h-5 w-5" style={{ color: "#fff" }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.2 }}>TalVault</div>
                  <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 1 }}>BY MINERVA</div>
                </div>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "22px 0 6px" }}>
                You're invited to join TalVault
              </h1>
              <p style={{ fontSize: 14, opacity: 0.95, margin: 0 }}>
                Secure document vault for talent agencies and their people.
              </p>
            </div>

            {/* Body */}
            <div style={{ padding: "28px 32px" }}>
              <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 14px" }}>
                Hi{inv.contact_person ? ` ${inv.contact_person}` : ""},
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 14px" }}>
                A TalVault administrator has invited <strong>{inv.agency_name}</strong> to
                onboard onto the TalVault platform.
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 20px" }}>
                Click the button below to accept your invitation and finish setting up your
                agency account. You'll create your own password on the next screen — we
                never send passwords by email.
              </p>

              <div style={{ textAlign: "center", margin: "24px 0 8px" }}>
                <a
                  href={inviteUrl}
                  style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    color: "#ffffff",
                    textDecoration: "none",
                    padding: "13px 28px",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 15,
                    boxShadow: "0 6px 16px rgba(99,102,241,0.35)",
                  }}
                >
                  Accept invitation
                </a>
              </div>

              <p style={{ fontSize: 13, color: "#5b6478", textAlign: "center", margin: "10px 0 0" }}>
                or paste this link into your browser:
                <br />
                <span style={{ wordBreak: "break-all", color: "#4338ca" }}>{inviteUrl}</span>
              </p>

              <div style={{ marginTop: 26, padding: "14px 16px", background: "#f7f8fb", borderRadius: 8, borderLeft: "3px solid #6366f1" }}>
                <div style={{ fontSize: 12, color: "#5b6478", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                  Expires
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{expiryDate}</div>
                <div style={{ fontSize: 12, color: "#5b6478", marginTop: 6 }}>
                  If the link expires, contact your TalVault administrator for a fresh invite.
                </div>
              </div>

              <p style={{ fontSize: 13, color: "#5b6478", lineHeight: 1.55, margin: "24px 0 0" }}>
                If you weren't expecting this email, you can safely ignore it — no account
                will be created without you accepting.
              </p>
            </div>

            {/* Footer */}
            <div style={{ padding: "18px 32px", background: "#0f172a", color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>TalVault · A Minerva product</div>
              <div>Sent to {inv.email} · <a href="#" style={{ color: "#a5b4fc", textDecoration: "none" }}>Privacy</a> · <a href="#" style={{ color: "#a5b4fc", textDecoration: "none" }}>Terms</a></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
