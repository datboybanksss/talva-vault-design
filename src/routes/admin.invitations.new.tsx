import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAgencyInvitation } from "@/lib/admin.functions";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invitations/new")({
  head: () => ({ meta: [{ title: "New Invitation · TalVault Admin" }] }),
  component: NewInvitationPage,
});

type BusinessType = "formal" | "informal";

const REQUIRED_DOCS: Record<BusinessType, string[]> = {
  formal: [
    "CIPC registration document",
    "Director ID document(s)",
    "Proof of business address",
    "Registered business contact number",
  ],
  informal: [
    "South African ID document",
    "Registered mobile number",
    "Proof of address",
  ],
};

function NewInvitationPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createAgencyInvitation);

  const [agencyName, setAgencyName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [expiryDays, setExpiryDays] = useState(14);

  const submit = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          agency_name: agencyName,
          contact_person: contact || undefined,
          email,
          business_type: businessType as BusinessType,
          supporting_docs: [],
          expiry_days: expiryDays,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation created. Email will be sent with unique secure link.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create invitation"),
  });

  const canSubmit =
    agencyName.trim() && email.trim() && businessType && !submit.isPending;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/invitations" className="tvp-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>New Agency Invitation</h1>
          <div className="tvp-subtitle">
            Sends a branded email with a unique secure link and expiry date. Passwords are never emailed.
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit.mutate();
          }}
        >
          <div className="tvp-form-group">
            <label>Agency name *</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              required
              placeholder="e.g. NewTech Talent Agency"
            />
          </div>
          <div className="tvp-form-group">
            <label>Primary contact person</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. Maya Johnson"
            />
          </div>
          <div className="tvp-form-group">
            <label>Contact email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="contact@agency.com"
            />
          </div>

          <div className="tvp-form-group">
            <label>Business type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(["formal", "informal"] as BusinessType[]).map((t) => {
                const active = businessType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBusinessType(t)}
                    className="tvp-card"
                    style={{
                      textAlign: "left",
                      padding: 14,
                      cursor: "pointer",
                      border: active
                        ? "2px solid var(--tvp-teal)"
                        : "1px solid var(--tvp-border)",
                      background: active ? "rgba(6,78,88,0.06)" : "var(--tvp-surface)",
                    }}
                  >
                    <div style={{ fontWeight: 600, textTransform: "capitalize", marginBottom: 4 }}>
                      {t}
                    </div>
                    <div className="tvp-muted" style={{ fontSize: 12 }}>
                      {t === "formal"
                        ? "Registered business / (Pty) Ltd / CC"
                        : "Sole trader / individual operator"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {businessType && (
            <div className="tvp-form-group">
              <label>Required compliance documents</label>
              <div
                className="tvp-callout"
                style={{
                  padding: 14,
                  border: "1px solid var(--tvp-border)",
                  borderRadius: 8,
                  background: "rgba(6,78,88,0.04)",
                }}
              >
                <div className="tvp-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  The invited agency will be asked to provide the following at onboarding:
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {REQUIRED_DOCS[businessType].map((d) => (
                    <li key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <CheckCircle2 className="h-4 w-4" style={{ color: "var(--tvp-teal)" }} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

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
          <div className="tvp-footer-actions">
            <Link to="/admin/invitations" className="tvp-secondary">Cancel</Link>
            <button className="tvp-primary" type="submit" disabled={!canSubmit}>
              {submit.isPending ? "Sending…" : "Create & send invitation"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
