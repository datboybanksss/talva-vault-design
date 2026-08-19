import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { listAgencyTalent, updateTalentLinkTalentType } from "@/lib/agency.functions";
import { useFolderCatalogue, talentTypesFrom } from "@/lib/folder-catalogue";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { ModalShell } from "@/components/shared/modal-shell";
import { usePagedList } from "@/lib/pagination";
import { LoadMoreRow } from "@/components/shared/load-more";
import {
  TALENT_LINK_STATUS_LABEL,
  TALENT_LINK_STATUS_TONE,
  TALENT_LINK_TABS,
} from "@/lib/status-labels";

export const Route = createFileRoute("/agency/talent")({
  head: () => ({ meta: [{ title: "Talent roster · TalVault" }] }),
  component: TalentPage,
});

const STATUS_LABEL = TALENT_LINK_STATUS_LABEL;
const STATUS_TONE = TALENT_LINK_STATUS_TONE;
const TAB_ORDER = TALENT_LINK_TABS;

type TalentRow = {
  id: string;
  displayName: string;
  status: string;
  talentType: string | null;
  managerName: string;
  nextAction: string | null;
  docCount: number;
  expiringDocsCount: number;
  lastDocumentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function nextActionLabel(r: TalentRow) {
  if (r.nextAction) return r.nextAction;
  if (r.status === "invited") return "Awaiting acceptance";
  if (r.status === "needs_review") return "Confirm document filing";
  if (r.expiringDocsCount > 0) return `${r.expiringDocsCount} document${r.expiringDocsCount === 1 ? "" : "s"} expiring soon`;
  if (r.status === "ended" || r.status === "read_only") return "No new actions";
  return "Nothing outstanding";
}

function TalentPage() {
  const qc = useQueryClient();
  const catalogue = useFolderCatalogue();
  const [typeEditor, setTypeEditor] = useState<TalentRow | null>(null);
  const [typeDraft, setTypeDraft] = useState("");
  const updateTypeFn = useServerFn(updateTalentLinkTalentType);
  const updateType = useMutation({
    mutationFn: (input: { talent_link_id: string; talent_type: string }) =>
      updateTypeFn({ data: input }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["agency", "talent"] });
      toast.success(
        res?.flaggedForReview
          ? `Talent type updated — ${res.flaggedForReview} folder${res.flaggedForReview === 1 ? "" : "s"} flagged for review`
          : "Talent type updated",
      );
      setTypeEditor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update talent type"),
  });
  const listFn = useServerFn(listAgencyTalent);
  const talent = useQuery({ queryKey: ["agency", "talent"], queryFn: () => listFn() });

  const rows: TalentRow[] = (talent.data ?? []) as TalentRow[];

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [manager, setManager] = useState("all");
  const [type, setType] = useState("all");

  const managerOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.managerName).filter(Boolean))).sort(),
    [rows],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.talentType).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    map.set("all", rows.length);
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === "all" || r.status === tab) &&
        (manager === "all" || r.managerName === manager) &&
        (type === "all" || r.talentType === type) &&
        (q === "" ||
          r.displayName.toLowerCase().includes(q) ||
          (r.talentType ?? "").toLowerCase().includes(q) ||
          r.managerName.toLowerCase().includes(q)),
    );
  }, [rows, tab, manager, type, search]);

  const page = usePagedList(filtered, { resetKey: `${tab}|${manager}|${type}|${search}` });

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("There is nothing to export in this view yet.");
      return;
    }
    const header = ["Talent", "Status", "Lead", "Talent type", "Documents", "Next action", "Joined"];
    const lines = filtered.map((r) => [
      r.displayName,
      STATUS_LABEL[r.status] ?? r.status,
      r.managerName,
      r.talentType ?? "",
      String(r.docCount),
      nextActionLabel(r),
      fmtDate(r.createdAt),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `talvault-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Roster exported.");
  };

  const clearFilters = () => {
    setTab("all");
    setManager("all");
    setType("all");
    setSearch("");
  };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Talent roster</h1>
          <div className="tvp-subtitle">Manage talent on your roster, invitations, and Roster Shared Folders.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>
          <Link to="/agency/talent/invite" className="tvp-primary"><Plus className="h-4 w-4" />Invite talent</Link>
        </div>
      </div>

      <div className="tvp-tabs">
        {TAB_ORDER.map((t) => (
          <button
            key={t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}{" "}
            <span className={`tvp-status tvp-${t.tone}`}>{counts.get(t.key) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <input
            className="tvp-search"
            placeholder="Search roster by name, type or lead…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            <select className="tvp-select" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="all">Lead: All</option>
              {managerOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select className="tvp-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Talent type: All</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {(tab !== "all" || manager !== "all" || type !== "all" || search !== "") && (
              <button className="tvp-select" onClick={clearFilters} style={{ cursor: "pointer", fontWeight: 700 }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="tvp-table-wrap">
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Talent</th><th>Status</th><th>Lead</th><th>Talent type</th>
                <th>Documents</th><th>Next action</th><th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {talent.isLoading && (
                <tr><td colSpan={7} className="tvp-muted">Loading your roster…</td></tr>
              )}
              {!talent.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="tvp-muted">
                    {rows.length === 0 ? (
                      <>
                        No talent on your roster yet — <Link to="/agency/talent/invite" className="tvp-link">invite your first talent</Link> to get started.
                      </>
                    ) : (
                      "No talent matches these filters — try clearing them."
                    )}
                  </td>
                </tr>
              )}
              {page.visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.displayName}</strong><br />
                    <span className="tvp-muted">
                      {r.talentType ? `${r.talentType} · ` : ""}
                      {r.status === "invited" ? `Invited ${fmtDate(r.createdAt)}` : `Joined ${fmtDate(r.createdAt)}`}
                    </span>
                  </td>
                  <td><span className={`tvp-status tvp-${STATUS_TONE[r.status] ?? "neutral"}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td>{r.managerName || "—"}</td>
                  <td>{r.talentType ?? "—"}</td>
                  <td>{r.docCount}</td>
                  <td>{nextActionLabel(r)}</td>
                  <td>
                    <RowActionsMenu
                      actions={[
                        {
                          key: "type",
                          label: "Change talent type",
                          icon: Tags,
                          onSelect: () => {
                            setTypeEditor(r);
                            setTypeDraft(r.talentType ?? "");
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              <LoadMoreRow
                colSpan={7}
                noun="talent"
                shown={page.shown}
                total={page.total}
                hasMore={page.hasMore}
                onLoadMore={page.loadMore}
              />
            </tbody>
          </table>
        </div>
      </div>

      {typeEditor && (
        <ModalShell onClose={() => setTypeEditor(null)} maxWidth={420}>
          <h2 className="tvp-h2" style={{ margin: 0 }}>Change talent type</h2>
          <p className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
            New folders for the chosen type are added to {typeEditor.displayName}'s shared folder.
            Folders from the previous type are kept and flagged for review — nothing is deleted.
          </p>
          <div className="tvp-form-group">
            <label htmlFor="talent-type">Talent type</label>
            <select
              id="talent-type"
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value)}
            >
              <option value="">Select a type…</option>
              {talentTypesFrom(catalogue).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-2 justify-end">
            <button className="tvp-secondary" onClick={() => setTypeEditor(null)}>Cancel</button>
            <button
              className="tvp-primary"
              disabled={!typeDraft || updateType.isPending}
              onClick={() =>
                updateType.mutate({ talent_link_id: typeEditor.id, talent_type: typeDraft })
              }
            >
              Save
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
