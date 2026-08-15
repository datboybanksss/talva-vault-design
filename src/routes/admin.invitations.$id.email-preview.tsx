import { TalVaultIcon, TalVaultWordmark } from "@/components/brand/talvault-logo";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Send, AlertTriangle, CheckCircle2, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import { getInvitationById } from "@/lib/admin.functions";
import { sendAgencyInvitationEmail } from "@/lib/invitation-email.functions";
import {
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_BODY,
  applyTokens,
  bodyParagraphs,
} from "@/lib/invitation-email.server";

export const Route = createFileRoute("/admin/invitations/$id/email-preview")({
  head: () => ({ meta: [{ title: "Invitation email · TalVault Admin" }] }),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const { id } = useParams({ from: "/admin/invitations/$id/email-preview" });
  const getFn = useServerFn(getInvitationById);
  const sendFn = useServerFn(sendAgencyInvitationEmail);
  const q = useQuery({
    queryKey: ["admin", "invitation", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const inv = q.data as any;

  const [subject, setSubject] = useState(DEFAULT_INVITATION_SUBJECT);
  const [body, setBody] = useState(DEFAULT_INVITATION_BODY);
  const [status, setStatus] = useState<
    { kind: "ok" | "error"; message: string } | null
  >(null);

  const [origin, setOrigin] = useState("https://talvault.app");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const inviteUrl = inv ? `${origin}/invite/${inv.token}` : "";
  const expiryDate = inv
    ? new Date(inv.expires_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  const vars = {
    contact_person: inv?.contact_person,
    agency_name: inv?.agency_name,
    email: inv?.email,
    expiry_date: expiryDate,
    invite_url: inviteUrl,
  };
  const renderedSubject = useMemo(() => applyTokens(subject, vars), [subject, inv, expiryDate]);
  const renderedParas = useMemo(
    () => bodyParagraphs(applyTokens(body, vars)),
    [body, inv, expiryDate, inviteUrl],
  );

  const sendM = useMutation({
    mutationFn: () =>
      sendFn({ data: { id, subject, body, invite_url: inviteUrl } }),
    onSuccess: (res: any) => {
      if (res?.sent) {
        setStatus({ kind: "ok", message: `Email sent to ${inv?.email}.` });
        toast.success("Invitation email sent.");
        return;
      }
      const msg =
        res?.reason === "domain_unverified" || res?.reason === "email_not_configured"
          ? "Email sending isn't available yet — domain verification pending. Copy the link and send it yourself for now."
          : `Send failed: ${res?.detail ?? "unknown error"}. Copy the link and send it yourself for now.`;
      setStatus({ kind: "error", message: msg });
      toast.error("Email not sent — see the status message.");
    },
    onError: (e: any) => {
      setStatus({
        kind: "error",
        message: `Send failed: ${e?.message ?? "unknown error"}. Copy the link and send it yourself for now.`,
      });
      toast.error("Email not sent — see the status message.");
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/invitations" search={{}} className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>Invitation email</h1>
          <div className="tvp-subtitle">
            Edit the subject and message, preview it exactly as the recipient sees it, then send.
            Tokens available: {"{{contact_person}}"}, {"{{agency_name}}"}, {"{{expiry_date}}"}.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={copyLink} disabled={!inv} title="Copy the unique invite link">
            <Copy className="h-4 w-4" />Copy link
          </button>
          <button
            className="tvp-primary"
            disabled={!inv || sendM.isPending || !subject.trim() || !body.trim()}
            onClick={() => { setStatus(null); sendM.mutate(); }}
          >
            <Send className="h-4 w-4" />{sendM.isPending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>

      {status && (
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
      )}

      {q.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}
      {!q.isLoading && !inv && <div className="tvp-card tvp-muted">Invitation not found.</div>}

      {inv && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 18, alignItems: "start" }}>
          {/* Editor */}
          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-title">Compose</div>
            <label className="tvp-label" style={{ display: "block", marginTop: 12 }}>Recipient</label>
            <input className="tvp-input" value={inv.email} readOnly />

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
              onClick={() => {
                setSubject(DEFAULT_INVITATION_SUBJECT);
                setBody(DEFAULT_INVITATION_BODY);
              }}
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
                <p style={{ fontSize: 14, opacity: 0.95, margin: 0 }}>
                  Secure document vault for talent agencies and their people.
                </p>
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
                    Accept invitation
                  </a>
                </div>

                <p style={{ fontSize: 13, color: "#5b6478", textAlign: "center", margin: "10px 0 0" }}>
                  or paste this link into your browser:
                  <br />
                  <span style={{ wordBreak: "break-all", color: "#064E58" }}>{inviteUrl}</span>
                </p>

                <div style={{ marginTop: 26, padding: "14px 16px", background: "#f7f8fb", borderRadius: 8, borderLeft: "3px solid #064E58" }}>
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

              <div style={{ padding: "18px 32px", background: "#0f172a", color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
                <TalVaultWordmark variant="white" style={{ height: 14, marginBottom: 6 }} />
                <div>Sent to {inv.email}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
