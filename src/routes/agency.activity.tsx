import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Upload,
  Trash2,
  Pencil,
  Send,
  UserPlus,
  UserMinus,
  UserCheck,
  FileText,
  RotateCcw,
  Link as LinkIcon,
  ShieldCheck,
  AlertTriangle,
  Download,
  Receipt,
} from "lucide-react";
import { listAgencyAuditLog, listAgencyAuditActions } from "@/lib/agency.functions";

export const Route = createFileRoute("/agency/activity")({
  head: () => ({ meta: [{ title: "Activity log · TalVault" }] }),
  component: AgencyActivityLog,
});

// -----------------------------------------------------------------------------
// Action metadata — label, category, icon, tone.
// -----------------------------------------------------------------------------
type Category = "talent" | "documents" | "sharing" | "billing" | "other";

type ActionMeta = {
  label: string;
  category: Category;
  icon: ReactElement;
  tone: "green" | "amber" | "red" | "blue" | "purple" | "teal";
};

const ACTIONS: Record<string, ActionMeta> = {
  create_talent_invitation: { label: "Invited talent", category: "talent", icon: <UserPlus className="h-4 w-4" />, tone: "blue" },
  resend_talent_invitation: { label: "Resent talent invitation", category: "talent", icon: <Send className="h-4 w-4" />, tone: "blue" },
  revoke_talent_invitation: { label: "Revoked talent invitation", category: "talent", icon: <UserMinus className="h-4 w-4" />, tone: "red" },
  copy_talent_invitation_link: { label: "Copied talent invite link", category: "talent", icon: <LinkIcon className="h-4 w-4" />, tone: "blue" },
  create_staff_invitation: { label: "Invited staff member", category: "talent", icon: <UserPlus className="h-4 w-4" />, tone: "purple" },
  resend_staff_invitation: { label: "Resent staff invitation", category: "talent", icon: <Send className="h-4 w-4" />, tone: "purple" },
  revoke_staff_invitation: { label: "Revoked staff invitation", category: "talent", icon: <UserMinus className="h-4 w-4" />, tone: "red" },
  copy_staff_invitation_link: { label: "Copied staff invite link", category: "talent", icon: <LinkIcon className="h-4 w-4" />, tone: "purple" },
  end_talent_relationship: { label: "Ended talent relationship", category: "talent", icon: <UserMinus className="h-4 w-4" />, tone: "red" },
  reactivate_talent_relationship: { label: "Reactivated talent relationship", category: "talent", icon: <UserCheck className="h-4 w-4" />, tone: "green" },

  upload_vault_document: { label: "Uploaded document", category: "documents", icon: <Upload className="h-4 w-4" />, tone: "green" },
  update_vault_document: { label: "Updated document", category: "documents", icon: <Pencil className="h-4 w-4" />, tone: "blue" },
  delete_vault_document: { label: "Deleted document", category: "documents", icon: <Trash2 className="h-4 w-4" />, tone: "red" },
  create_document_request: { label: "Requested document", category: "documents", icon: <FileText className="h-4 w-4" />, tone: "blue" },
  complete_document_request: { label: "Marked request complete", category: "documents", icon: <ShieldCheck className="h-4 w-4" />, tone: "green" },
  resubmit_document_request: { label: "Requested resubmission", category: "documents", icon: <RotateCcw className="h-4 w-4" />, tone: "amber" },
  cancel_document_request: { label: "Cancelled document request", category: "documents", icon: <AlertTriangle className="h-4 w-4" />, tone: "red" },

  share_document: { label: "Shared document", category: "sharing", icon: <LinkIcon className="h-4 w-4" />, tone: "teal" },
  unshare_document: { label: "Unshared document", category: "sharing", icon: <LinkIcon className="h-4 w-4" />, tone: "amber" },
  toggle_billing_shared: { label: "Toggled billing share", category: "sharing", icon: <LinkIcon className="h-4 w-4" />, tone: "teal" },

  create_billing_doc: { label: "Created quote/invoice", category: "billing", icon: <Receipt className="h-4 w-4" />, tone: "blue" },
  update_billing_doc: { label: "Updated quote/invoice", category: "billing", icon: <Pencil className="h-4 w-4" />, tone: "blue" },
  delete_billing_doc: { label: "Deleted quote/invoice", category: "billing", icon: <Trash2 className="h-4 w-4" />, tone: "red" },
  convert_quote_to_invoice: { label: "Converted quote to invoice", category: "billing", icon: <Receipt className="h-4 w-4" />, tone: "green" },
  send_billing_doc: { label: "Sent quote/invoice", category: "billing", icon: <Send className="h-4 w-4" />, tone: "teal" },
};

function metaFor(action: string): ActionMeta {
  return (
    ACTIONS[action] ?? {
      label: action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      category: "other",
      icon: <Activity className="h-4 w-4" />,
      tone: "blue",
    }
  );
}

function parseDevice(ua: string | null): { icon: ReactElement; label: string; kind: string } {
  if (!ua) return { icon: <Globe className="h-4 w-4" />, label: "Unknown device", kind: "unknown" };
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
  return { icon, label: `${browser} · ${os}`, kind: device };
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatFullTs(iso: string) {
  try {
    const d = new Date(iso);
    const s = d.toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    return `${s} · ${TZ}`;
  } catch {
    return iso;
  }
}

type AuditRow = {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detail: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

const CATEGORY_CHIPS: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All actions" },
  { key: "talent", label: "Talent activity" },
  { key: "documents", label: "Document operations" },
  { key: "sharing", label: "Sharing" },
  { key: "billing", label: "Invoice activity" },
];

const RANGE_OPTIONS = [
  { key: "1", label: "Last 24 hours" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function AgencyActivityLog() {
  const listFn = useServerFn(listAgencyAuditLog);
  const actionsFn = useServerFn(listAgencyAuditActions);

  const [category, setCategory] = useState<Category | "all">("all");
  const [range, setRange] = useState<string>("7");

  const since = useMemo(() => {
    if (range === "all") return undefined;
    const days = Number(range);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [range]);

  const rows = useQuery({
    queryKey: ["agency", "audit", range],
    queryFn: () =>
      listFn({ data: since ? { since } : {} }) as Promise<AuditRow[]>,
    refetchOnMount: "always",
  });

  const actions = useQuery({
    queryKey: ["agency", "audit-actions"],
    queryFn: () => actionsFn() as Promise<string[]>,
  });

  const list: AuditRow[] = rows.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const r of list) {
      const cat = metaFor(r.action).category;
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [list]);

  const filtered = useMemo(
    () => (category === "all" ? list : list.filter((r) => metaFor(r.action).category === category)),
    [list, category],
  );

  const handleExport = () => {
    const header = ["Timestamp", "Timezone", "Actor", "Actor email", "Action", "Category", "Target type", "Target", "Device", "IP address"];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of filtered) {
      const m = metaFor(r.action);
      const dev = parseDevice(r.userAgent);
      lines.push([
        r.createdAt, TZ, r.actorName, r.actorEmail ?? "", m.label, m.category,
        r.targetType ?? "", r.targetLabel ?? "", dev.label, r.ipAddress ?? "",
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">
            <Activity className="inline h-6 w-6" style={{ marginRight: 8, verticalAlign: -4 }} />
            Activity log
          </h1>
          <div className="tvp-subtitle">
            Activity across your agency — talent, documents, sharing, invoices.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="tvp-select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Date range"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button className="tvp-secondary" onClick={handleExport} disabled={!filtered.length}>
            <Download className="inline h-4 w-4" style={{ marginRight: 6, verticalAlign: -3 }} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="flex flex-wrap gap-2 pb-4">
          {CATEGORY_CHIPS.map((chip) => {
            const active = category === chip.key;
            const n = counts[chip.key] ?? 0;
            return (
              <button
                key={chip.key}
                onClick={() => setCategory(chip.key)}
                className={`tvp-chip${active ? " tvp-chip-active" : ""}`}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--tvp-border, #e5e7eb)",
                  background: active ? "var(--tvp-primary, #2563eb)" : "transparent",
                  color: active ? "#fff" : "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {chip.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({n})</span>
              </button>
            );
          })}
          <div className="tvp-muted" style={{ alignSelf: "center", fontSize: 12, marginLeft: "auto" }}>
            Showing {filtered.length} event{filtered.length === 1 ? "" : "s"}
            {actions.data ? ` · ${actions.data.length} action types tracked` : ""}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.isLoading && <div className="tvp-muted">Loading activity…</div>}
          {!rows.isLoading && filtered.length === 0 && (
            <div className="tvp-muted" style={{ padding: 20, textAlign: "center" }}>
              No activity recorded in this range.
            </div>
          )}
          {filtered.map((r) => {
            const m = metaFor(r.action);
            const dev = parseDevice(r.userAgent);
            return (
              <div
                key={r.id}
                className="tvp-activity-row"
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 14px",
                  border: "1px solid var(--tvp-border, #e5e7eb)",
                  borderRadius: 10,
                  alignItems: "flex-start",
                }}
              >
                <div className={`tvp-kpi-icon tvp-bg-${m.tone} shrink-0`} style={{ width: 36, height: 36 }}>
                  {m.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}>
                    <strong>{r.actorName}</strong>{" "}
                    <span className="tvp-muted">— {m.label}</span>
                    {r.targetLabel && (
                      <>
                        {" "}
                        <strong>{r.targetLabel}</strong>
                      </>
                    )}
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <span>{formatFullTs(r.createdAt)}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {dev.icon}
                      {dev.label}
                    </span>
                    <span>
                      IP{" "}
                      {r.ipAddress ? (
                        <code style={{ fontSize: 11 }}>{r.ipAddress}</code>
                      ) : (
                        <em>unknown</em>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
