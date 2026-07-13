import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Plus, Lock, Ban, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencies,
  suspendAgency,
  unsuspendAgency,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { SuspendAgencyDialog } from "@/components/admin/suspend-agency-dialog";

export const Route = createFileRoute("/admin/agencies/")({
  head: () => ({ meta: [{ title: "Agencies · TalVault Admin" }] }),
  component: AgenciesPage,
});

const statusLabel: Record<string, string> = {
  incomplete: "Incomplete",
  invited: "Invited",
  accepted: "Accepted",
  expired: "Expired",
  declined: "Declined",
  suspended: "Suspended",
};
const statusTone: Record<string, string> = {
  incomplete: "purple",
  invited: "blue",
  accepted: "green",
  expired: "amber",
  declined: "red",
  suspended: "teal",
};

function AgenciesPage() {
  const listFn = useServerFn(listAgencies);
  const suspendFn = useServerFn(suspendAgency);
  const unsuspendFn = useServerFn(unsuspendAgency);
  const qc = useQueryClient();

  const agencies = useQuery({
    queryKey: ["admin", "agencies"],
    queryFn: () => listFn(),
  });

  const suspendM = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      suspendFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency suspended and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to suspend"),
  });
  const unsuspendM = useMutation({
    mutationFn: (id: string) => unsuspendFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency reinstated.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to reinstate"),
  });

  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);

  const list = agencies.data ?? [];
  const visible = useMemo(() => {
    return list.filter((a: any) => {
      if (tab !== "all" && a.status !== tab) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [list, tab, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: list.length,
      incomplete: 0, invited: 0, accepted: 0, expired: 0, declined: 0, suspended: 0,
    };
    for (const a of list) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [list]);

  const exportCsv = () => {
    const headers = ["Agency", "Status", "Contact person", "Contact email", "Country", "Talent", "Created"];
    const rows = visible.map((a: any) => [
      a.name,
      statusLabel[a.status],
      a.contact_person ?? "",
      a.contact_email ?? "",
      a.country ?? "",
      String(a.talent_count),
      new Date(a.created_at).toISOString().slice(0, 10),
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agencies-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doSuspend = (id: string, name: string) => {
    setSuspendTarget({ id, name });
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agencies</h1>
          <div className="tvp-subtitle">Manage and monitor all agency accounts.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />Export
          </button>
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Plus className="h-4 w-4" />Invite Agency
          </Link>
        </div>
      </div>

      <div className="tvp-tabs">
        {(["all", "accepted", "invited", "incomplete", "suspended", "expired", "declined"] as const).map((k) => (
          <button
            key={k}
            className={`tvp-tab${tab === k ? " tvp-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {k === "all" ? "All" : statusLabel[k]}
            <span className={`tvp-status tvp-${k === "all" ? "neutral" : statusTone[k]}`}>
              {counts[k] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Agency</th><th>Status</th><th>Contact</th><th>Country</th><th>Talent</th><th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              {agencies.isLoading && (
                <tr><td colSpan={7} className="tvp-muted">Loading agencies…</td></tr>
              )}
              {!agencies.isLoading && visible.length === 0 && (
                <tr><td colSpan={7} className="tvp-muted">
                  No agencies to show. <Link to="/admin/invitations/new" className="tvp-link">Invite an agency →</Link>
                </td></tr>
              )}
              {visible.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <Link to="/admin/agencies/$id" params={{ id: a.id }}>
                      <strong>{a.name}</strong>
                    </Link>
                    {a.contact_email && (
                      <>
                        <br />
                        <span className="tvp-muted">{a.contact_email}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`tvp-status tvp-${statusTone[a.status]}`}>
                      {statusLabel[a.status]}
                    </span>
                    {a.status === "suspended" && (
                      <span
                        className="tvp-muted"
                        title="Active actions blocked, read-only / export preserved"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, fontSize: 11 }}
                      >
                        <Lock className="h-3 w-3" /> read-only
                      </span>
                    )}
                  </td>
                  <td>{a.contact_person ?? "—"}</td>
                  <td>{a.country ?? "—"}</td>
                  <td>{a.talent_count}</td>
                  <td>
                    {new Date(a.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    {a.status === "suspended" ? (
                      <button
                        className="tvp-mini-btn"
                        title="Reinstate agency"
                        onClick={() => unsuspendM.mutate(a.id)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        className="tvp-mini-btn"
                        title="Suspend agency"
                        onClick={() => doSuspend(a.id, a.name)}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {suspendTarget && (
        <SuspendAgencyDialog
          agencyName={suspendTarget.name}
          isPending={suspendM.isPending}
          onCancel={() => setSuspendTarget(null)}
          onConfirm={(reason) => {
            suspendM.mutate(
              { id: suspendTarget.id, reason },
              { onSuccess: () => setSuspendTarget(null) },
            );
          }}
        />
      )}
    </>
  );
}
