import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, FileText, Mail, FileSpreadsheet, MoreVertical, Info } from "lucide-react";
import { toast } from "sonner";
import {
  agencyWhoami,
  getAgencyDashboardMetrics,
  listAgencyTalent,
  endTalentRelationship,
  reactivateTalentRelationship,
} from "@/lib/agency.functions";

export const Route = createFileRoute("/agency/")({
  head: () => ({ meta: [{ title: "Manager dashboard · TalVault" }] }),
  component: AgencyDashboard,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  expired: "Expired",
  read_only: "Read-only",
  revoked: "Revoked",
  needs_review: "Needs Review",
  ended: "Ended",
};

const STATUS_TONE: Record<string, string> = {
  active: "green",
  invited: "blue",
  expired: "amber",
  read_only: "teal",
  revoked: "red",
  needs_review: "purple",
  ended: "neutral",
};

const CHIP_ORDER: Array<{ key: string; tone: string }> = [
  { key: "active", tone: "green" },
  { key: "invited", tone: "blue" },
  { key: "expired", tone: "amber" },
  { key: "read_only", tone: "teal" },
  { key: "revoked", tone: "red" },
  { key: "needs_review", tone: "purple" },
  { key: "ended", tone: "neutral" },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function AgencyDashboard() {
  const qc = useQueryClient();
  const whoamiFn = useServerFn(agencyWhoami);
  const getMetricsFn = useServerFn(getAgencyDashboardMetrics);
  const listTalentFn = useServerFn(listAgencyTalent);
  const endFn = useServerFn(endTalentRelationship);
  const reactivateFn = useServerFn(reactivateTalentRelationship);

  const who = useQuery({ queryKey: ["agency", "whoami"], queryFn: () => whoamiFn() });
  const metrics = useQuery({
    queryKey: ["agency", "metrics"],
    queryFn: () => getMetricsFn(),
    refetchInterval: 60_000,
  });
  const talent = useQuery({
    queryKey: ["agency", "talent"],
    queryFn: () => listTalentFn(),
  });

  const isOwner = who.data?.role === "owner";

  const endMut = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Relationship ended. Existing documents remain accessible; new uploads are blocked.");
      qc.invalidateQueries({ queryKey: ["agency", "talent"] });
      qc.invalidateQueries({ queryKey: ["agency", "vault", "talent-links"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to end relationship"),
  });
  const reactivateMut = useMutation({
    mutationFn: (id: string) => reactivateFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Relationship reactivated.");
      qc.invalidateQueries({ queryKey: ["agency", "talent"] });
      qc.invalidateQueries({ queryKey: ["agency", "vault", "talent-links"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reactivate"),
  });

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [manager, setManager] = useState("all");
  const [type, setType] = useState("all");

  type TalentRow = {
    id: string;
    displayName: string;
    status: string;
    talentType: string | null;
    managerUserId: string | null;
    managerName: string;
    nextAction: string | null;
    docCount: number;
    createdAt: string;
    updatedAt: string;
  };
  const rows: TalentRow[] = (talent.data ?? []) as TalentRow[];

  const managerOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.managerName).filter(Boolean))),
    [rows],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.talentType).filter(Boolean) as string[])),
    [rows],
  );


  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return CHIP_ORDER.map((c) => ({
      key: c.key,
      label: STATUS_LABEL[c.key],
      tone: c.tone,
      num: counts.get(c.key) ?? 0,
    }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (manager === "all" || r.managerName === manager) &&
          (type === "all" || r.talentType === type),
      ),
    [rows, statusFilter, manager, type],
  );

  const reset = () => {
    setStatusFilter("all");
    setManager("all");
    setType("all");
  };

  const agencyName = who.data?.agency?.name ?? "your agency";
  const firstName = who.data?.firstName || who.data?.displayName?.split(" ")[0] || "there";

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Manager dashboard</h1>
          <div className="tvp-subtitle">
            Welcome back, {firstName}. Here's what needs attention for {agencyName}.
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <Link to="/agency/talent" className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.talentCount ?? "—"}</div>
            <div className="tvp-kpi-label">Talent Profiles</div>
            <div className="tvp-kpi-sub">Across your workspace</div>
          </div>
        </Link>
        <Link to="/agency/document-vault" className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.vaultDocumentsCount ?? "—"}</div>
            <div className="tvp-kpi-label">Vault Documents</div>
            <div className="tvp-kpi-sub" style={{ color: "var(--tvp-blue)" }}>Shared with your agency</div>
          </div>
        </Link>
        <Link to="/agency/invitations" className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.invitationsCount ?? "—"}</div>
            <div className="tvp-kpi-label">Invitations</div>
            <div className="tvp-kpi-sub tvp-warn">
              {metrics.data?.invitationsNeedAction ?? 0} need action
            </div>
          </div>
        </Link>
        <Link to="/agency/quotes-invoices" className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><FileSpreadsheet className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{metrics.data?.billingDocsCount ?? "—"}</div>
            <div className="tvp-kpi-label">Quotes & Invoices</div>
            <div className="tvp-kpi-sub">Across all talent</div>
          </div>
        </Link>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">
            Talent Roster overview <Info className="inline h-4 w-4 text-[var(--tvp-muted)]" />
          </h2>
          <Link to="/agency/talent" className="tvp-link">View full roster →</Link>
        </div>

        <div className="flex flex-wrap gap-3 pb-4">
          <select
            className="tvp-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Status: All</option>
            {CHIP_ORDER.map((c) => (
              <option key={c.key} value={c.key}>{STATUS_LABEL[c.key]}</option>
            ))}
          </select>
          <select
            className="tvp-select"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            <option value="all">Lead: All</option>
            {managerOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            className="tvp-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">Talent Type: All</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="tvp-secondary" onClick={reset}>Reset filters</button>
        </div>

        <div className="tvp-life-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              className={`tvp-life-chip${statusFilter === c.key ? " tvp-active-filter" : ""}`}
              onClick={() => setStatusFilter(statusFilter === c.key ? "all" : c.key)}
              style={{ background: `var(--tvp-${c.tone}-bg)`, color: `var(--tvp-${c.tone})` }}
            >
              <div className="tvp-label">{c.label}</div>
              <div className="tvp-num">{c.num}</div>
            </button>
          ))}
        </div>

        <div className="tvp-muted" style={{ fontSize: 12, margin: "-4px 0 14px 2px" }}>
          {statusFilter === "all" && manager === "all" && type === "all"
            ? `Showing all ${rows.length} roster entries`
            : `Showing ${filtered.length} of ${rows.length} roster entries`}
        </div>

        <table className="tvp-table">
          <thead>
            <tr>
              <th>Talent</th>
              <th>Status</th>
              <th>Type</th>
              <th>Lead</th>
              <th>Shared Docs</th>
              <th>Next Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {talent.isLoading && (
              <tr><td colSpan={7} className="tvp-muted">Loading talent…</td></tr>
            )}
            {!talent.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="tvp-muted">
                  {rows.length === 0
                    ? "No talent on your roster yet. Invite talent to get started."
                    : "No roster entries match the current filters."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.displayName}</strong>
                  <br />
                  <span className="tvp-muted">
                    {r.talentType ? `${r.talentType} · ` : ""}
                    {r.status === "invited"
                      ? `Invited ${formatDate(r.createdAt)}`
                      : `Updated ${formatDate(r.updatedAt)}`}
                  </span>
                </td>
                <td>
                  <span className={`tvp-status tvp-${STATUS_TONE[r.status] ?? "neutral"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td>{r.talentType ?? "—"}</td>
                <td>{r.managerName}</td>
                <td>{r.docCount}</td>
                <td>{r.nextAction ?? "—"}</td>
                <td style={{ position: "relative" }}>
                  <button
                    className="tvp-mini-btn"
                    title="Actions"
                    onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                    disabled={!isOwner || endMut.isPending || reactivateMut.isPending}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuId === r.id && isOwner && (
                    <div
                      style={{
                        position: "absolute", right: 8, top: 32, zIndex: 20,
                        background: "white", border: "1px solid var(--tvp-border, #e5e7eb)",
                        borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                        minWidth: 200, padding: 4,
                      }}
                      onMouseLeave={() => setOpenMenuId(null)}
                    >
                      {r.status === "ended" ? (
                        <button
                          className="tvp-mini-btn"
                          style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}
                          onClick={() => {
                            setOpenMenuId(null);
                            if (confirm(`Reactivate relationship with ${r.displayName}? New uploads will be allowed again.`)) {
                              reactivateMut.mutate(r.id);
                            }
                          }}
                        >
                          Reactivate relationship
                        </button>
                      ) : (
                        <button
                          className="tvp-mini-btn"
                          style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", color: "var(--tvp-red, #b91c1c)" }}
                          onClick={() => {
                            setOpenMenuId(null);
                            if (confirm(`End working relationship with ${r.displayName}?\n\nExisting shared documents remain accessible under current retention rules. New uploads and versions will be blocked until reactivated.`)) {
                              endMut.mutate(r.id);
                            }
                          }}
                        >
                          End relationship…
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
