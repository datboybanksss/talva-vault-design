import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus, Tags, UserCog, Users as UsersIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  listAgencyStaff,
  listAgencyTalent,
  setTalentManager,
  updateTalentLinkTalentType,
} from "@/lib/agency.functions";
import { useFolderCatalogue, talentTypesFrom } from "@/lib/folder-catalogue";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { ModalShell } from "@/components/shared/modal-shell";
import { EntityCard } from "@/components/shared/entity-card";
import { usePagedList } from "@/lib/pagination";
import { TALENT_LINK_STATUS_LABEL, TALENT_LINK_STATUS_TONE } from "@/lib/status-labels";

export const Route = createFileRoute("/agency/talent/")({
  head: () => ({
    meta: [
      { title: "Talent roster · TalVault" },
      {
        name: "description",
        content:
          "See everyone on your agency roster at a glance — status, talent type, documents and what needs attention.",
      },
      { property: "og:title", content: "Talent roster · TalVault" },
      {
        property: "og:description",
        content: "Manage the talent on your agency roster and their shared folders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalentPage,
});

const STATUS_LABEL = TALENT_LINK_STATUS_LABEL;
const STATUS_TONE = TALENT_LINK_STATUS_TONE;

/**
 * Roster grouping. Each card still shows the talent's own individual status —
 * these groups only decide which tab a card appears under.
 */
const TAB_GROUPS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "active", label: "Active", statuses: ["active", "needs_review", "read_only"] },
  { key: "invited", label: "Invited", statuses: ["invited"] },
  { key: "ended", label: "Ended", statuses: ["ended", "expired", "revoked"] },
  { key: "all", label: "All", statuses: null },
];

type TalentRow = {
  id: string;
  displayName: string;
  status: string;
  talentType: string | null;
  avatarUrl: string | null;
  managerName: string;
  nextAction: string | null;
  docCount: number;
  awaitingCount: number;
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

  const rows: TalentRow[] = useMemo(() => (talent.data ?? []) as TalentRow[], [talent.data]);

  const [tab, setTab] = useState("active");
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
    for (const g of TAB_GROUPS) {
      map.set(
        g.key,
        g.statuses === null ? rows.length : rows.filter((r) => g.statuses!.includes(r.status)).length,
      );
    }
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const group = TAB_GROUPS.find((g) => g.key === tab);
    return rows.filter(
      (r) =>
        (!group?.statuses || group.statuses.includes(r.status)) &&
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
    const header = ["Talent", "Status", "Lead", "Talent type", "Documents", "Awaiting", "Expiring", "Next action", "Joined"];
    const lines = filtered.map((r) => [
      r.displayName,
      STATUS_LABEL[r.status] ?? r.status,
      r.managerName,
      r.talentType ?? "",
      String(r.docCount),
      String(r.awaitingCount),
      String(r.expiringDocsCount),
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
    setTab("active");
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

      <div className="tvp-tabs tvp-roster-tabs" role="tablist" aria-label="Roster status">
        {TAB_GROUPS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts.get(t.key) ?? 0})
          </button>
        ))}
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="tvp-entity-stat-label" htmlFor="roster-search">Search</label>
            <input
              id="roster-search"
              className="tvp-search"
              placeholder="Search roster by name, type or lead…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="tvp-entity-stat-label" htmlFor="roster-lead">Lead</label>
              <select id="roster-lead" className="tvp-select" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="all">All leads</option>
                {managerOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="tvp-entity-stat-label" htmlFor="roster-type">Talent type</label>
              <select id="roster-type" className="tvp-select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">All types</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {(tab !== "active" || manager !== "all" || type !== "all" || search !== "") && (
              <button className="tvp-select" onClick={clearFilters} style={{ cursor: "pointer", fontWeight: 700 }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {talent.isLoading ? (
          <div className="tvp-muted" style={{ padding: "28px 4px" }}>Loading your roster…</div>
        ) : talent.isError ? (
          <div style={{ textAlign: "center", padding: "36px 16px" }}>
            <h3 className="tvp-h3">Your roster could not be loaded</h3>
            <p className="tvp-muted" style={{ marginTop: 6 }}>
              {(talent.error as Error)?.message ?? "Something went wrong."}
            </p>
            <button className="tvp-secondary" style={{ marginTop: 14 }} onClick={() => talent.refetch()}>
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 16px" }}>
            <UsersIcon className="h-5 w-5" style={{ margin: "0 auto 10px", opacity: 0.6 }} />
            {rows.length === 0 ? (
              <>
                <h3 className="tvp-h3">No talent on your roster yet</h3>
                <p className="tvp-muted" style={{ marginTop: 6 }}>
                  <Link to="/agency/talent/invite" className="tvp-link">Invite your first talent</Link> to get started.
                </p>
              </>
            ) : (
              <>
                <h3 className="tvp-h3">No talent matches this view</h3>
                <p className="tvp-muted" style={{ marginTop: 6 }}>Try another tab or clear your filters.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="tvp-entity-grid" style={{ marginTop: 16 }}>
              {page.visible.map((r) => (
                <EntityCard
                  key={r.id}
                  name={r.displayName}
                  avatarSeed={r.id}
                  photoUrl={r.avatarUrl}
                  subtitle={r.talentType ?? "Talent type not set"}
                  pills={
                    <>
                      <span className={`tvp-status tvp-${STATUS_TONE[r.status] ?? "neutral"}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      <span className="tvp-entity-since">
                        {r.status === "invited" ? "Invited" : "Since"} {fmtDate(r.createdAt)}
                      </span>
                    </>
                  }
                  stats={[
                    { label: "Documents", value: r.docCount },
                    { label: "Awaiting", value: r.awaitingCount, tone: r.awaitingCount > 0 ? "amber" : undefined },
                    { label: "Expiring", value: r.expiringDocsCount, tone: r.expiringDocsCount > 0 ? "amber" : undefined },
                  ]}
                  actions={
                    <RowActionsMenu
                      label={`Actions for ${r.displayName}`}
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
                  }
                />
              ))}
            </div>
            {page.hasMore && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <button type="button" className="tvp-secondary" onClick={page.loadMore}>
                  Show more talent ({page.shown} of {page.total})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {typeEditor && (
        <ModalShell
          onClose={() => setTypeEditor(null)}
          maxWidth={460}
          labelledBy="change-talent-type-title"
        >
          <div className="tvp-modal-head">
            <h3 className="tvp-h2" id="change-talent-type-title">Change talent type</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setTypeEditor(null)}
              aria-label="Close"
            >
              <X />
            </Button>
          </div>
          <div className="tvp-modal-body">
            <p className="tvp-small tvp-muted" style={{ marginTop: 0 }}>
              New folders for the chosen type are added to {typeEditor.displayName}'s shared folder.
              Folders from the previous type are kept and flagged for review — nothing is deleted.
            </p>
            <div className="tvp-form-group">
              <Label htmlFor="talent-type">Talent type</Label>
              <Select value={typeDraft} onValueChange={setTypeDraft}>
                <SelectTrigger id="talent-type" className="tvp-modal-control">
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {talentTypesFrom(catalogue).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="tvp-modal-foot">
            <Button type="button" variant="outline" onClick={() => setTypeEditor(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!typeDraft || updateType.isPending}
              onClick={() =>
                updateType.mutate({ talent_link_id: typeEditor.id, talent_type: typeDraft })
              }
            >
              Save
            </Button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
