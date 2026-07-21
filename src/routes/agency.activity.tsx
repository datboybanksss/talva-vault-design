import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Monitor, Smartphone, Tablet, Globe } from "lucide-react";
import { listAgencyAuditLog, listAgencyAuditActions } from "@/lib/agency.functions";


export const Route = createFileRoute("/agency/activity")({
  head: () => ({ meta: [{ title: "Activity log · TalVault" }] }),
  component: AgencyActivityLog,
});

const ACTION_LABELS: Record<string, string> = {
  create_talent_invitation: "Invited talent",
  resend_talent_invitation: "Resent talent invitation",
  revoke_talent_invitation: "Revoked talent invitation",
  create_staff_invitation: "Invited staff member",
  resend_staff_invitation: "Resent staff invitation",
  revoke_staff_invitation: "Revoked staff invitation",
  copy_talent_invitation_link: "Copied talent invite link",
  copy_staff_invitation_link: "Copied staff invite link",
  upload_vault_document: "Uploaded document",
  delete_vault_document: "Deleted document",
  update_vault_document: "Updated document",
  end_talent_relationship: "Ended talent relationship",
  reactivate_talent_relationship: "Reactivated talent relationship",
  create_billing_doc: "Created quote/invoice",
  update_billing_doc: "Updated quote/invoice",
  delete_billing_doc: "Deleted quote/invoice",
};

function humanAction(a: string) {
  return ACTION_LABELS[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function parseDevice(ua: string | null): { icon: JSX.Element; label: string } {
  if (!ua) return { icon: <Globe className="h-4 w-4" />, label: "Unknown device" };
  const u = ua.toLowerCase();
  let device: "mobile" | "tablet" | "desktop" = "desktop";
  if (/ipad|tablet/.test(u)) device = "tablet";
  else if (/mobi|iphone|android(?!.*tablet)/.test(u)) device = "mobile";

  let os = "Unknown OS";
  if (/windows nt/.test(u)) os = "Windows";
  else if (/mac os x|macintosh/.test(u)) os = "macOS";
  else if (/iphone|ipad|ios/.test(u)) os = "iOS";
  else if (/android/.test(u)) os = "Android";
  else if (/linux/.test(u)) os = "Linux";

  let browser = "Browser";
  if (/edg\//.test(u)) browser = "Edge";
  else if (/chrome\//.test(u) && !/edg\//.test(u)) browser = "Chrome";
  else if (/firefox\//.test(u)) browser = "Firefox";
  else if (/safari\//.test(u) && !/chrome\//.test(u)) browser = "Safari";

  const icon =
    device === "mobile" ? <Smartphone className="h-4 w-4" /> :
    device === "tablet" ? <Tablet className="h-4 w-4" /> :
    <Monitor className="h-4 w-4" />;
  return { icon, label: `${browser} · ${os}` };
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AgencyActivityLog() {
  const listFn = useServerFn(listAgencyAuditLog);
  const actionsFn = useServerFn(listAgencyAuditActions);

  const [actionFilter, setActionFilter] = useState<string>("all");

  const actions = useQuery({
    queryKey: ["agency", "audit-actions"],
    queryFn: () => actionsFn(),
  });
  const rows = useQuery({
    queryKey: ["agency", "audit", actionFilter],
    queryFn: () =>
      listFn({ data: actionFilter === "all" ? {} : { action: actionFilter } }),
  });

  const list = rows.data ?? [];

  const actorOptions = useMemo(
    () => Array.from(new Set(list.map((r) => r.actorName))).sort(),
    [list],
  );
  const [actorFilter, setActorFilter] = useState<string>("all");

  const filtered = useMemo(
    () => list.filter((r) => actorFilter === "all" || r.actorName === actorFilter),
    [list, actorFilter],
  );

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">
            <Activity className="inline h-6 w-6" style={{ marginRight: 8, verticalAlign: -4 }} />
            Activity log
          </h1>
          <div className="tvp-subtitle">
            Every action taken in your agency workspace, with device and IP details.
            City/country lookup will be added in a later release.
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="flex flex-wrap gap-3 pb-4">
          <select
            className="tvp-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">Action: All</option>
            {(actions.data ?? []).map((a) => (
              <option key={a} value={a}>{humanAction(a)}</option>
            ))}
          </select>
          <select
            className="tvp-select"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          >
            <option value="all">Actor: All</option>
            {actorOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            className="tvp-secondary"
            onClick={() => { setActionFilter("all"); setActorFilter("all"); }}
          >
            Reset filters
          </button>
          <div className="tvp-muted" style={{ alignSelf: "center", fontSize: 12 }}>
            Showing {filtered.length} of {list.length} events (latest 200)
          </div>
        </div>

        <table className="tvp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Device</th>
              <th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {rows.isLoading && (
              <tr><td colSpan={6} className="tvp-muted">Loading activity…</td></tr>
            )}
            {!rows.isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="tvp-muted">No activity recorded yet.</td></tr>
            )}
            {filtered.map((r) => {
              const dev = parseDevice(r.userAgent);
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt)}</td>
                  <td>
                    <strong>{r.actorName}</strong>
                    {r.actorEmail && (
                      <div className="tvp-muted" style={{ fontSize: 12 }}>{r.actorEmail}</div>
                    )}
                  </td>
                  <td>{humanAction(r.action)}</td>
                  <td>
                    {r.targetLabel ? (
                      <>
                        <div>{r.targetLabel}</div>
                        {r.targetType && (
                          <div className="tvp-muted" style={{ fontSize: 12 }}>
                            {r.targetType.replace(/_/g, " ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="tvp-muted">—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {dev.icon}
                      <span>{dev.label}</span>
                    </div>
                  </td>
                  <td>
                    {r.ipAddress ? (
                      <code style={{ fontSize: 12 }}>{r.ipAddress}</code>
                    ) : (
                      <span className="tvp-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
