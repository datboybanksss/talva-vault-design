import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Ban, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAgencyById,
  suspendAgency,
  unsuspendAgency,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/agencies/$id")({
  head: () => ({ meta: [{ title: "Agency · TalVault Admin" }] }),
  component: AgencyDetail,
});

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
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "agency", id],
    queryFn: () => getFn({ data: { id } }),
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
                onClick={() => {
                  const reason = window.prompt(`Reason for suspending ${a.name}?`)?.trim();
                  if (reason) suspendM.mutate(reason);
                }}
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
    </>
  );
}
