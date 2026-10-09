import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { listMyLinkRequests, respondToLinkRequest } from "@/lib/link-requests.functions";

export const Route = createFileRoute("/talent/requests")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connection requests · TalVault Talent" },
      {
        name: "description",
        content: "Agencies that would like to connect with your TalVault. Accept or decline each request.",
      },
    ],
  }),
  component: RequestsPage,
});

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

function RequestsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyLinkRequests);
  const respondFn = useServerFn(respondToLinkRequest);
  const q = useQuery({ queryKey: ["talent", "link-requests"], queryFn: () => listFn() });
  const m = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => respondFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.accept ? "Connected. Your shared folders are ready." : "Request declined. Nothing was shared.");
      qc.invalidateQueries({ queryKey: ["talent"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong."),
  });
  const rows = q.data ?? [];

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Connection requests</h1>
          <div className="tvp-subtitle">
            Connecting creates a shared folder with that agency. They never see your Private Vault.
          </div>
        </div>
      </div>
      <div className="tvp-card tvp-panel">
        {q.isLoading ? (
          <div className="tvp-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="tvp-muted">You have no open connection requests.</div>
        ) : (
          <table className="tvp-table">
            <thead>
              <tr><th>Agency</th><th>Received</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.agencyName}</strong></td>
                  <td>{fmt(r.requestedAt)}</td>
                  <td>{fmt(r.expiresAt)}</td>
                  <td>
                    <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
                      <button className="tvp-secondary" disabled={m.isPending}
                        onClick={() => m.mutate({ id: r.id, accept: false })}>
                        <X className="h-4 w-4" /> Decline
                      </button>
                      <button className="tvp-primary" disabled={m.isPending}
                        onClick={() => m.mutate({ id: r.id, accept: true })}>
                        <Check className="h-4 w-4" /> Accept
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
