import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { ClientDetailView, useClientDetail } from "@/components/agency/client-detail-panel";
import { ClientFormModal, clientToForm } from "@/components/agency/clients-panel";

export const Route = createFileRoute("/agency/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client · TalVault" },
      { name: "description", content: "Client details and their quotes and invoices." },
      { property: "og:title", content: "Client · TalVault" },
      { property: "og:description", content: "Client details and their quotes and invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const { data } = useClientDetail(clientId);
  const [editing, setEditing] = useState(false);
  const client = data?.client;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/agency/clients" className="tvp-link" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <ArrowLeft className="h-4 w-4" /> Clients
          </Link>
          <h1 className="tvp-h1">{client?.name ?? "Client"}</h1>
        </div>
        {client && (
          <div className="tvp-actions">
            <button type="button" className="tvp-secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit client
            </button>
          </div>
        )}
      </div>
      <ClientDetailView clientId={clientId} />
      {editing && client && (
        <ClientFormModal
          initial={clientToForm(client)}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  );
}
