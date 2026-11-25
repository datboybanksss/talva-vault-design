import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getReportsAccess, listReportsAccess, setReportsAccess } from "@/lib/reports.functions";
import {
  REPORT_ROLES,
  REPORT_ROLE_LABELS,
  REPORT_PERMISSIONS,
  roleCan,
  type ReportRole,
} from "@/lib/reports-contract";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { useSessionReady } from "@/hooks/use-session-ready";
export const Route = createFileRoute("/admin/reports-access")({
  head: () => ({
    meta: [
      { title: "Reports access · TalVault Admin" },
      {
        name: "description",
        content: "Owner-controlled, audited TalVault Reports access and download permissions.",
      },
      { property: "og:title", content: "Reports access · TalVault Admin" },
      {
        property: "og:description",
        content: "Manage separate TalVault Reports roles and protect private reporting evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsAccessPage,
});
function ReportsAccessPage() {
  const sessionReady = useSessionReady();
  const roleFn = useServerFn(getReportsAccess),
    listFn = useServerFn(listReportsAccess),
    setFn = useServerFn(setReportsAccess),
    qc = useQueryClient();
  const role = useQuery({
    queryKey: ["admin", "reports-access"],
    queryFn: () => roleFn(),
    enabled: sessionReady,
    retry: false,
  });
  const rows = useQuery({
    queryKey: ["admin", "reports-access-list"],
    queryFn: () => listFn(),
    enabled: sessionReady && role.data === "owner",
  });
  const [changes, setChanges] = useState<Record<string, ReportRole>>({});
  const save = useMutation({
    mutationFn: async () => {
      const changesOrdered = Object.entries(changes).sort(
        (a, b) => Number(b[1] === "owner") - Number(a[1] === "owner"),
      );
      for (const [userId, role] of changesOrdered) await setFn({ data: { userId, role } });
    },
    onSuccess: () => {
      setChanges({});
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Reports access updated and audited.");
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast.error(friendlyError(e, "Reports access could not be updated."));
    },
  });
  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <ShieldCheck />
          <h1 className="tvp-h1">Reports access</h1>
        </div>
        {role.data === "owner" && (
          <Button
            disabled={!Object.keys(changes).length || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {save.isPending ? "Saving…" : "Save access"}
          </Button>
        )}
      </header>
      <p className="text-sm text-muted-foreground mb-5">
        Reports access is separate from existing administrator edit rights. Only an Owner can change
        it. Reports access changes cannot remove the last active Owner; every access change is
        audited.
      </p>
      {role.isPending && <p role="status">Checking access…</p>}
      {role.isError && (
        <p className="text-muted-foreground">Access could not be checked. Please try again.</p>
      )}
      {role.data && role.data !== "owner" && (
        <p className="text-muted-foreground">
          Your Reports role is {REPORT_ROLE_LABELS[role.data]}. Ask a Reports Owner to change
          access.
        </p>
      )}
      {rows.isError && (
        <p className="text-muted-foreground">The administrator list could not be loaded.</p>
      )}
      {role.data === "owner" && (
        <div className="overflow-x-auto border border-border rounded-md mb-6">
          <table className="tvp-table min-w-[440px]">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Reports role</th>
              </tr>
            </thead>
            <tbody>
              {rows.data?.map((a) => (
                <tr key={a.user_id}>
                  <td>{a.name}</td>
                  <td>
                    <select
                      className="!h-11 !min-w-36"
                      aria-label={`Reports role for ${a.name}`}
                      value={changes[a.user_id] ?? a.role}
                      onChange={(e) => {
                        const next = REPORT_ROLES.find((r) => r === e.target.value);
                        if (next) setChanges({ ...changes, [a.user_id]: next });
                      }}
                    >
                      {REPORT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {REPORT_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="tvp-table min-w-[850px]">
          <thead>
            <tr>
              <th>Role</th>
              {REPORT_PERMISSIONS.map((p) => (
                <th key={p}>{p.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REPORT_ROLES.map((r) => (
              <tr key={r}>
                <td>{REPORT_ROLE_LABELS[r]}</td>
                {REPORT_PERMISSIONS.map((p) => (
                  <td key={p}>{roleCan(r, p) ? "Allowed" : "Not allowed"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Operations, Analyst and Viewer use redacted Reports. Reports roles do not change access to
        Accounts, Invitations, Documents, Billing, Audit, Administrators, Terms or Launch screens.
        Messaging permissions are reserved; sending is not available in this phase.
      </p>
    </section>
  );
}
