import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";
import {
  listAdministrators,
  whoami,
  listLegalCopyItems,
  markLegalCopyApproved,
  logOwnPasswordChange,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/password-input";
import {
  MIN_PW_LENGTH,
  scorePassword,
  validateNewPassword,
  friendlyAuthError,
} from "@/lib/password";

export const Route = createFileRoute("/admin/administrators")({
  head: () => ({ meta: [{ title: "Administrators · TalVault Admin" }] }),
  component: AdminsPage,
});

function AdminsPage() {
  const listFn = useServerFn(listAdministrators);
  const whoamiFn = useServerFn(whoami);
  const listLegalFn = useServerFn(listLegalCopyItems);
  const approveLegalFn = useServerFn(markLegalCopyApproved);
  const qc = useQueryClient();

  const admins = useQuery({
    queryKey: ["admin", "administrators"],
    queryFn: () => listFn(),
  });
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn() });
  const legal = useQuery({
    queryKey: ["admin", "legal"],
    queryFn: () => listLegalFn(),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveLegalFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Legal / copy item approved.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const [tab, setTab] = useState<"admins" | "legal">("admins");

  const list = admins.data ?? [];
  const stats = useMemo(() => {
    return {
      total: list.length,
      main: list.filter((a: any) => a.is_main_admin).length,
    };
  }, [list]);

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Administrators & Legal Review</h1>
          <div className="tvp-subtitle">
            Platform administrators and legal / copy review items (bell reminders).
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.total}</div>
            <div className="tvp-kpi-label">Total Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.main}</div>
            <div className="tvp-kpi-label">Main Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">
              {(legal.data ?? []).filter((l: any) => l.status === "approved").length}
            </div>
            <div className="tvp-kpi-label">Approved Legal / Copy Items</div>
          </div>
        </div>
      </div>

      <div className="tvp-tabs">
        <button
          className={`tvp-tab${tab === "admins" ? " tvp-active" : ""}`}
          onClick={() => setTab("admins")}
        >
          Administrators
        </button>
        <button
          className={`tvp-tab${tab === "legal" ? " tvp-active" : ""}`}
          onClick={() => setTab("legal")}
        >
          Legal & Copy Review
          <span className={`tvp-status tvp-amber`}>
            {(legal.data ?? []).filter((l: any) => l.status !== "approved").length}
          </span>
        </button>
      </div>

      {tab === "admins" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Administrators</h2>
          </div>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Administrator</th><th>Email</th><th>Role</th><th>Granted</th>
              </tr>
            </thead>
            <tbody>
              {admins.isLoading && (
                <tr><td colSpan={4} className="tvp-muted">Loading…</td></tr>
              )}
              {list.map((a: any) => (
                <tr key={a.user_id}>
                  <td>
                    <strong>{a.display_name || a.email.split("@")[0]}</strong>
                    {a.user_id === me.data?.userId && (
                      <span
                        className="tvp-status tvp-blue"
                        style={{ marginLeft: 8, padding: "3px 7px", fontSize: 10 }}
                      >
                        You
                      </span>
                    )}
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <span
                      className={`tvp-status tvp-${a.is_main_admin ? "purple" : "blue"}`}
                    >
                      {a.is_main_admin ? "Main Administrator" : "Administrator"}
                    </span>
                  </td>
                  <td>
                    {new Date(a.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "admins" && me.data?.email && (
        <ChangeOwnPasswordCard email={me.data.email} />
      )}

      {tab === "legal" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Legal & Copy Review</h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              T&Cs, disclaimers and system copy. Placeholder items appear in the bell until approved.
            </span>
          </div>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Item</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(legal.data ?? []).length === 0 && !legal.isLoading && (
                <tr><td colSpan={4} className="tvp-muted">No legal / copy items configured yet.</td></tr>
              )}
              {(legal.data ?? []).map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.title}</strong>
                    {l.body && (
                      <>
                        <br />
                        <span className="tvp-muted" style={{ fontSize: 12 }}>{l.body}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span
                      className={`tvp-status tvp-${
                        l.status === "approved"
                          ? "green"
                          : l.status === "in_review"
                            ? "amber"
                            : "red"
                      }`}
                    >
                      {l.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    {new Date(l.updated_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    {l.status !== "approved" && (
                      <button
                        className="tvp-secondary"
                        onClick={() => approve.mutate(l.id)}
                        disabled={approve.isPending}
                      >
                        Mark approved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
