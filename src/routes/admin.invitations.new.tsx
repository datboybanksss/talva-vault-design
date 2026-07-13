import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAgencyInvitation } from "@/lib/admin.functions";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invitations/new")({
  head: () => ({ meta: [{ title: "New Invitation · TalVault Admin" }] }),
  component: NewInvitationPage,
});

function NewInvitationPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createAgencyInvitation);

  const [agencyName, setAgencyName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [docs, setDocs] = useState("");
  const [expiryDays, setExpiryDays] = useState(14);

  const submit = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          agency_name: agencyName,
          contact_person: contact || undefined,
          email,
          supporting_docs: docs
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
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

  const canSubmit = agencyName.trim() && email.trim() && !submit.isPending;

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
            <label>Supporting documents (one URL per line)</label>
            <textarea
              value={docs}
              onChange={(e) => setDocs(e.target.value)}
              rows={3}
              placeholder="https://..."
            />
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
