import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Ban, RotateCcw, Send, Users } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAgencyById,
  suspendAgency,
  unsuspendAgency,
  listAgencyInvitationsForAgency,
  listTalentInvitationsForAgency,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { SuspendAgencyDialog } from "@/components/admin/suspend-agency-dialog";

export const Route = createFileRoute("/admin/agencies/$id")({
  head: () => ({ meta: [{ title: "Agency · TalVault Admin" }] }),
  component: AgencyDetail,
});

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}
const invStatusTone: Record<string, string> = {
  pending: "blue", accepted: "green", expired: "red",
  declined: "neutral", revoked: "neutral",
};

const statusTone: Record<string, string> = {
  incomplete: "purple",
  invited: "blue",
  accepted: "green",
  expired: "amber",
  declined: "red",
  suspended: "teal",
};

function AgencyDetail() {
  const { id } = useParams({ from: "/admin/agencies/$id" });
  const getFn = useServerFn(getAgencyById);
  const suspendFn = useServerFn(suspendAgency);
  const unsuspendFn = useServerFn(unsuspendAgency);
  const listAgencyInvFn = useServerFn(listAgencyInvitationsForAgency);
  const listTalentInvFn = useServerFn(listTalentInvitationsForAgency);
  const qc = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "agency", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const agencyInv = useQuery({
    queryKey: ["admin", "agency", id, "agency-invitations"],
    queryFn: () => listAgencyInvFn({ data: { agency_id: id } }),
  });
  const talentInv = useQuery({
    queryKey: ["admin", "agency", id, "talent-invitations"],
    queryFn: () => listTalentInvFn({ data: { agency_id: id } }),
  });

  const suspendM = useMutation({
    mutationFn: (reason: string) => suspendFn({ data: { id, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency suspended and logged.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const unsuspendM = useMutation({
    mutationFn: () => unsuspendFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Agency reinstated.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const a = q.data as any;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link
            to="/admin/agencies"
            className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <ArrowLeft className="h-3 w-3" /> Back to agencies
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {a?.name ?? (q.isLoading ? "Loading…" : "Agency not found")}
          </h1>
          {a && (
            <div className="tvp-subtitle" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className={`tvp-status tvp-${statusTone[a.status]}`}>{a.status}</span>
              {a.contact_email}
            </div>
          )}
        </div>
        {a && (
          <div className="tvp-actions">
            {a.status === "suspended" ? (
              <button className="tvp-secondary" onClick={() => unsuspendM.mutate()}>
                <RotateCcw className="h-4 w-4" />Reinstate
              </button>
            ) : (
              <button
                className="tvp-secondary"
                onClick={() => setSuspendOpen(true)}
              >
                <Ban className="h-4 w-4" />Suspend
              </button>
            )}
          </div>
        )}
      </div>

      {a && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Agency details</h2>
          <div className="tvp-form-layout" style={{ marginTop: 12 }}>
            <div>
              <p><strong>Contact person</strong><br />{a.contact_person ?? "—"}</p>
              <p style={{ marginTop: 10 }}><strong>Contact email</strong><br />{a.contact_email ?? "—"}</p>
              <p style={{ marginTop: 10 }}><strong>Phone</strong><br />{a.phone ?? "—"}</p>
              <p style={{ marginTop: 10 }}><strong>Country</strong><br />{a.country ?? "—"}</p>
            </div>
            <div>
              <p><strong>Created</strong><br />
                {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              {a.status === "suspended" && (
                <>
                  <p style={{ marginTop: 10 }}><strong>Suspension reason</strong><br />{a.suspension_reason ?? "—"}</p>
                  <p style={{ marginTop: 10 }}><strong>Suspended at</strong><br />
                    {a.suspended_at
                      ? new Date(a.suspended_at).toLocaleString("en-GB")
                      : "—"}
                  </p>
                </>
              )}
              {a.notes && (
                <p style={{ marginTop: 10 }}><strong>Notes</strong><br />{a.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {a && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Send className="h-4 w-4" /> Agency users invited
            </h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              Invitations sent by admin to onboard this agency (ADM-V1-012).
            </span>
          </div>
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Email</th><th>Contact</th><th>Status</th><th>Sent</th><th>Expires</th><th>Sends</th>
                </tr>
              </thead>
              <tbody>
                {agencyInv.isLoading && (
                  <tr><td colSpan={6} className="tvp-muted">Loading…</td></tr>
                )}
                {!agencyInv.isLoading && (agencyInv.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="tvp-muted">No agency-user invitations on record.</td></tr>
                )}
                {(agencyInv.data ?? []).map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{i.contact_person ?? "—"}</td>
                    <td><span className={`tvp-status tvp-${invStatusTone[i.status] ?? "neutral"}`}>{i.status}</span></td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>{fmtDate(i.expires_at)}</td>
                    <td>{i.send_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {a && (
        <div className="tvp-card tvp-panel">
          <div className="tvp-panel-head">
            <h2 className="tvp-h2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Users className="h-4 w-4" /> Talent invited by this agency
            </h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              Invitations this agency has sent to Talent. Separate from the agency-user invitations above.
            </span>
          </div>
          <div className="tvp-table-wrap">
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Talent</th><th>Email</th><th>Status</th><th>Sent</th><th>Expires</th><th>Sends</th>
                </tr>
              </thead>
              <tbody>
                {talentInv.isLoading && (
                  <tr><td colSpan={6} className="tvp-muted">Loading…</td></tr>
                )}
                {!talentInv.isLoading && (talentInv.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="tvp-muted">No Talent invitations from this agency yet.</td></tr>
                )}
                {(talentInv.data ?? []).map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.talent_name ?? "—"}</td>
                    <td>{i.email}</td>
                    <td><span className={`tvp-status tvp-${invStatusTone[i.status] ?? "neutral"}`}>{i.status}</span></td>
                    <td>{fmtDate(i.last_sent_at)}</td>
                    <td>{fmtDate(i.expires_at)}</td>
                    <td>{i.send_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {a && suspendOpen && (
        <SuspendAgencyDialog
          agencyName={a.name}
          isPending={suspendM.isPending}
          onCancel={() => setSuspendOpen(false)}
          onConfirm={(reason) => {
            suspendM.mutate(reason, {
              onSuccess: () => setSuspendOpen(false),
            });
          }}
        />
      )}
    </>
  );
}
