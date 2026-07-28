import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { listTalentAuditLog } from "@/lib/talent-audit.functions";

const ACTION_META: Record<string, { label: string; tone: string }> = {
  password_changed: { label: "Password changed", tone: "teal" },
  mfa_enrolled: { label: "Two-factor enabled", tone: "green" },
  mfa_disabled: { label: "Two-factor disabled", tone: "amber" },
};

function humanAction(a: string) {
  return ACTION_META[a]?.label ?? a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function device(ua: string | null) {
  if (!ua) return "—";
  const browser =
    /Edg\//.test(ua) ? "Edge"
      : /Chrome\//.test(ua) ? "Chrome"
        : /Safari\//.test(ua) ? "Safari"
          : /Firefox\//.test(ua) ? "Firefox"
            : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
      : /Mac OS X/.test(ua) ? "macOS"
        : /Android/.test(ua) ? "Android"
          : /iPhone|iPad/.test(ua) ? "iOS"
            : /Linux/.test(ua) ? "Linux"
              : "Unknown OS";
  return `${browser} · ${os}`;
}

export function SecurityLogPanel() {
  const listFn = useServerFn(listTalentAuditLog);
  const q = useQuery({ queryKey: ["talent", "audit-log"], queryFn: () => listFn() });
  const rows = q.data ?? [];

  return (
    <div className="tvp-card tvp-panel">
      <div className="tvp-panel-head">
        <div>
          <h2 className="tvp-h2">Security log</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Every account security change on your profile — password updates and two-factor changes.
            Passwords and 2FA secrets are never recorded.
          </p>
        </div>
        <span className="tvp-status tvp-teal">
          <ShieldCheck className="h-3.5 w-3.5" /> {rows.length} event{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="tvp-table-wrap" style={{ marginTop: 12 }}>
        <table className="tvp-table">
          <thead>
            <tr>
              <th>Time</th><th>Action</th><th>Target</th><th>IP address</th><th>Device</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5} className="tvp-muted">Loading events…</td></tr>}
            {!q.isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="tvp-muted">No security events yet.</td></tr>
            )}
            {rows.map((e: any) => (
              <tr key={e.id}>
                <td>
                  {new Date(e.created_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td>
                  <span className={`tvp-status tvp-${ACTION_META[e.action]?.tone ?? "neutral"}`}>
                    {humanAction(e.action)}
                  </span>
                </td>
                <td>{e.target_label ?? "—"}</td>
                <td>{e.ip_address ?? "—"}</td>
                <td className="tvp-muted">{device(e.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
