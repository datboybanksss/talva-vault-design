import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, FolderOpen, Sparkles, FileText, Files, Trash2, Download, Eye, X, Loader2,
  Lock, History, ShieldPlus, Search, ChevronRight, ChevronDown, FileSignature, Award, Receipt, IdCard, Users as UsersIcon, HeartPulse, Landmark, AlertTriangle, Inbox, CalendarClock, RefreshCw, Plane, Briefcase,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, useInfiniteQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyVaultDocuments,
  listAgencyVaultExpiring,
  getAgencyVaultTalentSummary,
  getAgencyVaultFolderCounts,
  listAgencyTalentLinksLite,
  listAgencyTalentFolders,
  registerAgencyVaultDocument,
  getAgencyVaultSignedUrl,
  deleteAgencyVaultDocument,
  agencyWhoami,
  listAgencyDocumentVersions,
  registerAgencyDocumentVersion,
  getAgencyVersionSignedUrl,
  upsertAgencyRetentionRule,
} from "@/lib/agency.functions";
import { useFolderCatalogue, useFolderNames, type CatalogueCategory } from "@/lib/folder-catalogue";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type VaultDoc = {
  id: string;
  name: string;
  folder: string;
  status: string;
  validityExpiresAt: string | null;
  storagePath: string | null;
  talentLinkId: string | null;
  talentName: string;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lockedUntil: string | null;
  currentVersionId: string | null;
  pendingReview?: boolean;
};
type TalentLinkLite = { id: string; displayName: string; status: string };
type TalentSummary = {
  talentLinkId: string;
  docCount: number;
  reviewCount: number;
  folderCount: number;
};
type FolderCount = {
  folder: string;
  docCount: number;
  reviewCount: number;
  expiringCount: number;
};

import { VaultRequestsPanel, requestsListQO, requestsTalentQO } from "@/components/agency/vault-requests-panel";
import { AiFilingReviewModal } from "@/components/shared/ai-filing-review-modal";
import { PAGE_SIZE } from "@/lib/pagination";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { LoadMoreRow } from "@/components/shared/load-more";

const talentSummaryQO = queryOptions({
  queryKey: ["agency", "vault", "talent-summary"],
  queryFn: () => getAgencyVaultTalentSummary() as Promise<TalentSummary[]>,
});
const expiringQO = queryOptions({
  queryKey: ["agency", "vault", "expiring"],
  queryFn: () => listAgencyVaultExpiring({ data: { days: 180, limit: 5 } }) as Promise<VaultDoc[]>,
});
const talentLinksQO = queryOptions({
  queryKey: ["agency", "vault", "talent-links"],
  queryFn:  () => listAgencyTalentLinksLite() as Promise<TalentLinkLite[]>,
});
const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn:  () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/document-vault")({
  head: () => ({ meta: [{ title: "Document Vault · TalVault" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(talentSummaryQO),
      context.queryClient.ensureQueryData(expiringQO),
      context.queryClient.ensureQueryData(talentLinksQO),
      context.queryClient.ensureQueryData(meQO),
      context.queryClient.ensureQueryData(requestsListQO),
      context.queryClient.ensureQueryData(requestsTalentQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Document Vault</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: VaultPage,
});


const tabs = ["All Documents", "Pending Review", "Needs Review", "Expiring", "Recently Updated", "Requests"] as const;
type Tab = typeof tabs[number];



type FolderMeta = {
  key: string;
  label: string;
  description: string;
  icon: any;
};
const FOLDER_META: Record<string, { description: string; icon: any }> = {
  "Identity & Personal": { description: "Passport, ID, visa, work authorisation", icon: IdCard },
  "Contracts & Agreements": { description: "Agreements, riders, addenda", icon: FileSignature },
  "Banking, Tax & Financial": { description: "Invoices, tax and banking records", icon: Receipt },
  "Travel & Visas": { description: "Itineraries, visas, travel approvals", icon: Plane },
  "Medical, Fitness & Insurance": { description: "Clearances, cover, fitness records", icon: HeartPulse },
  "Career & Professional Records": { description: "CVs, accreditations, career history", icon: Briefcase },
  "Brand, Sponsorship & Media": { description: "Brand deals, partnerships, media", icon: Award },
  "Bookings, Events & Appearances": { description: "Bookings, call sheets, appearances", icon: CalendarClock },
  "Rights, Licences & Compliance": { description: "Licences, certifications, compliance", icon: ShieldPlus },
  "Other Documents": { description: "Anything that does not fit elsewhere", icon: Files },
};
function allowedFoldersFrom(categories: CatalogueCategory[]): FolderMeta[] {
  return categories.map((f) => ({
    key: f.name,
    label: f.name,
    description: FOLDER_META[f.name]?.description ?? "",
    icon: FOLDER_META[f.name]?.icon ?? FolderOpen,
  }));
}
const BLOCKED_FOLDERS: FolderMeta[] = [
  { key: "family", label: "Family / Loved Ones", description: "Talent's personal contacts", icon: UsersIcon },
  { key: "medical", label: "Medical / Insurance", description: "Health records, insurance", icon: HeartPulse },
  { key: "finance", label: "Personal Finance", description: "Bank statements, taxes", icon: Landmark },
];

function statusTone(status: string): "purple" | "green" | "amber" {
  if (status === "ai_suggested") return "purple";
  if (status === "filed") return "green";
  return "amber";
}
function statusLabel(status: string): string {
  if (status === "ai_suggested") return "AI suggested";
  if (status === "filed") return "Filed";
  return "Needs review";
}
function formatValidity(iso: string | null): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return `Expires ${d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

type ProvisionedFolder = {
  id: string;
  folderName: string;
  sortOrder: number;
  parentFolderId: string | null;
  categorySlug: string | null;
  restricted: boolean;
  needsReview: boolean;
  source: string;
};

/** Folders for one talent only — never the whole roster's folder set. */
const talentFoldersQO = (talentLinkId: string | null) =>
  queryOptions({
    queryKey: ["agency", "vault", "talent-folders", talentLinkId],
    queryFn: () =>
      listAgencyTalentFolders({ data: { talent_link_id: talentLinkId! } }) as Promise<ProvisionedFolder[]>,
    enabled: !!talentLinkId,
  });

const folderCountsQO = (talentLinkId: string | null) =>
  queryOptions({
    queryKey: ["agency", "vault", "folder-counts", talentLinkId],
    queryFn: () =>
      getAgencyVaultFolderCounts({ data: { talent_link_id: talentLinkId! } }) as Promise<FolderCount[]>,
    enabled: !!talentLinkId,
  });

/** Maps the visible tab onto the server-side filter the API understands. */
const TAB_FILTER: Record<Tab, "all" | "pending_review" | "needs_review" | "expiring" | "recently_updated"> = {
  "All Documents": "all",
  "Pending Review": "pending_review",
  "Needs Review": "needs_review",
  "Expiring": "expiring",
  "Recently Updated": "recently_updated",
  "Requests": "all",
};


function VaultPage() {
  const qc = useQueryClient();
  const folderOptions = useFolderNames();
  const { data: talentLinks } = useSuspenseQuery(talentLinksQO);
  const { data: me } = useSuspenseQuery(meQO);
  const { data: requestRows } = useSuspenseQuery(requestsListQO);
  const { data: talentSummary = [] } = useSuspenseQuery(talentSummaryQO);
  const { data: expiring = [] } = useSuspenseQuery(expiringQO);
  const searchParams = Route.useSearch();
  const initialTab: Tab = (tabs as readonly string[]).includes(searchParams.tab ?? "")
    ? (searchParams.tab as Tab)
    : "All Documents";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [requestsAutoOpen, setRequestsAutoOpen] = useState(false);

  const needsActionCount = useMemo(
    () => requestRows.filter(r => r.status === "pending" || r.status === "submitted").length,
    [requestRows],
  );

  const [mode, setMode] = useState<"browse" | "search">("browse");
  const [talentId, setTalentId] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [folderSel, setFolderSel] = useState<{ label: string; names: string[]; restricted: boolean } | null>(null);

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [talentFilter, setTalentFilter] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [versionsFor, setVersionsFor] = useState<VaultDoc | null>(null);
  const [newVersionFor, setNewVersionFor] = useState<VaultDoc | null>(null);
  const [overrideFor, setOverrideFor] = useState<VaultDoc | null>(null);
  const [aiReviewFor, setAiReviewFor] = useState<{ id: string; name: string } | null>(null);

  const isOwner = me?.role === "owner";
  const upsertRuleFn = useServerFn(upsertAgencyRetentionRule);

  const registerFn = useServerFn(registerAgencyVaultDocument);
  const signedFn = useServerFn(getAgencyVaultSignedUrl);
  const deleteFn = useServerFn(deleteAgencyVaultDocument);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const viewMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "inline" } }),
    onSuccess: ({ url, name }) => setPreview({ url, name }),
    onError: (e: any) => toast.error(e?.message ?? "Could not open file"),
  });

  const downloadMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "attachment" } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
    onError: (e: any) => toast.error(e?.message ?? "Could not download file"),
  });

  // ---- Folder tree for the selected talent, live from agency_talent_folders ----
  const { data: talentFolders = [], isLoading: foldersLoading } = useQuery(talentFoldersQO(talentId));
  const { data: folderCounts = [] } = useQuery(folderCountsQO(talentId));

  const countsByFolder = useMemo(() => {
    const m = new Map<string, FolderCount>();
    for (const c of folderCounts) m.set(c.folder, c);
    return m;
  }, [folderCounts]);

  const categories = useMemo(() => {
    const parents = talentFolders
      .filter((f) => !f.parentFolderId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.folderName.localeCompare(b.folderName));
    return parents.map((p) => {
      const children = talentFolders
        .filter((f) => f.parentFolderId === p.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.folderName.localeCompare(b.folderName));
      const names = [p.folderName, ...children.map((c) => c.folderName)];
      const agg = names.reduce(
        (acc, n) => {
          const c = countsByFolder.get(n);
          if (c) {
            acc.count += c.docCount;
            acc.reviewCount += c.reviewCount;
            acc.expiringCount += c.expiringCount;
          }
          return acc;
        },
        { count: 0, reviewCount: 0, expiringCount: 0 },
      );
      return {
        folder: p,
        children,
        names,
        ...agg,
        needsReview: p.needsReview || children.some((c) => c.needsReview),
      };
    });
  }, [talentFolders, countsByFolder]);

  const summaryByTalent = useMemo(() => {
    const m = new Map<string, TalentSummary>();
    for (const s of talentSummary) m.set(s.talentLinkId, s);
    return m;
  }, [talentSummary]);

  const selectedTalent = talentLinks.find((l) => l.id === talentId) ?? null;

  // ---- Which documents the current mode + tab are looking at ----
  // Filtering, search and paging all happen in Postgres: the browser only ever
  // holds the pages it has actually asked for.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const queryArgs = useMemo(() => {
    const base = {
      tab: TAB_FILTER[tab],
      talentLinkId: null as string | null,
      folderNames: null as string[] | null,
      folder: null as string | null,
      search: "",
    };
    if (mode === "browse") {
      base.talentLinkId = talentId;
      base.folderNames = folderSel?.names ?? null;
    } else {
      base.folder = folderFilter === "all" ? null : folderFilter;
      base.talentLinkId = talentFilter === "all" ? null : talentFilter;
      base.search = debouncedSearch;
    }
    return base;
  }, [mode, tab, talentId, folderSel, folderFilter, talentFilter, debouncedSearch]);

  const docsQuery = useInfiniteQuery({
    queryKey: ["agency", "vault", "docs", queryArgs],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listAgencyVaultDocuments({
        data: { ...queryArgs, limit: PAGE_SIZE, offset: pageParam as number },
      }) as Promise<{ rows: VaultDoc[]; total: number }>,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const visibleDocs = useMemo(
    () => (docsQuery.data?.pages ?? []).flatMap((p) => p.rows),
    [docsQuery.data],
  );
  const totalDocs = docsQuery.data?.pages[0]?.total ?? 0;
  const page = {
    visible: visibleDocs,
    shown: visibleDocs.length,
    total: totalDocs,
    hasMore: !!docsQuery.hasNextPage,
    loadMore: () => docsQuery.fetchNextPage(),
    isLoadingMore: docsQuery.isFetchingNextPage,
  };


  const showTalentPicker = mode === "browse" && !talentId && tab === "All Documents";
  const showFolderGrid = mode === "browse" && !!talentId && !folderSel && tab === "All Documents";
  const showTable = tab !== "Requests" && !showTalentPicker && !showFolderGrid;

  function pickTalent(id: string) {
    setTalentId(id);
    setFolderSel(null);
    setOpenCategory(null);
  }

  return (
    <>
      <div className="tvp-topbar" style={{ marginBottom: 12, alignItems: "center" }}>
        <div>
          <h1 className="tvp-h1">Document Vault</h1>
        </div>
        <div className="tvp-actions">
          <button
            className={mode === "search" ? "tvp-primary" : "tvp-secondary"}
            onClick={() => {
              setMode(mode === "search" ? "browse" : "search");
              if (tab === "Requests") setTab("All Documents");
            }}
            title="Search every document across the whole roster"
          >
            <Search className="h-4 w-4" />
            {mode === "search" ? "Back to browsing" : "Search all documents"}
          </button>
          <button
            className="tvp-purple-btn"
            title="Ask a talent to submit a specific document"
            onClick={() => { setRequestsAutoOpen(true); setTab("Requests"); }}
          >
            <Inbox className="h-4 w-4" />Request Document
          </button>
          <button className="tvp-primary" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" />Upload to Talent
          </button>
        </div>
      </div>

      {tab !== "Requests" && (
      <div className="tvp-card" style={{ marginBottom: 10, padding: "10px 14px" }}>
        <h2 className="tvp-h2" style={{ marginBottom: 4 }}>Expiring soon</h2>
        {expiring.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing expires in the next 180 days — your roster is fully up to date.
          </p>
        ) : (
          <div className="tvp-list" style={{ marginTop: 6 }}>
            {expiring.map((d) => (
              <div key={d.id} className="tvp-list-item">
                <FileText className="h-5 w-5 text-[var(--tvp-amber)]" />
                <div>
                  <strong>{d.talentName} · {d.name}</strong>
                  <div className="tvp-muted">{formatValidity(d.validityExpiresAt)}</div>
                </div>
                <span className={`tvp-status tvp-${(daysUntil(d.validityExpiresAt) ?? 0) <= 60 ? "amber" : "blue"}`}>
                  {daysUntil(d.validityExpiresAt)} days
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="tvp-tabs" style={{ marginTop: 10, marginBottom: 14 }}>
        {tabs.map((t) => {
          const isRequests = t === "Requests";
          if (isRequests && mode === "search") return null;
          const iconMap: Record<Tab, { Icon: typeof Files; color: string }> = {
            "All Documents": { Icon: Files, color: "var(--tvp-teal)" },
            "Pending Review": { Icon: Sparkles, color: "var(--tvp-purple, #7c3aed)" },
            "Needs Review": { Icon: Eye, color: "var(--tvp-teal)" },
            "Expiring": { Icon: CalendarClock, color: "var(--tvp-amber)" },
            "Recently Updated": { Icon: RefreshCw, color: "var(--tvp-teal)" },
            "Requests": { Icon: Inbox, color: "var(--tvp-purple, #7c3aed)" },
          };
          const { Icon, color } = iconMap[t];
          const label: Record<Tab, string> = {
            "All Documents": mode === "search" ? "All results" : "Browse",
            "Pending Review": "Pending review",
            "Needs Review": "Needs review",
            "Expiring": "Expiring",
            "Recently Updated": "Recently updated",
            "Requests": "Requests",
          };
          return (
            <button
              key={t}
              className={`tvp-tab${tab === t ? " tvp-active" : ""}`}
              onClick={() => setTab(t)}
            >
              <Icon className="h-3.5 w-3.5" style={{ color }} />
              {label[t]}
              {isRequests && needsActionCount > 0 && (
                <span className="tvp-tab-dot" title={`${needsActionCount} needs action`} />
              )}
            </button>
          );
        })}
      </div>

      {mode === "browse" && tab !== "Requests" && (
        <div
          className="tvp-muted"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10, flexWrap: "wrap" }}
        >
          <button
            type="button"
            className="tvp-link"
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onClick={() => { setTalentId(null); setFolderSel(null); setOpenCategory(null); }}
          >
            Talent roster
          </button>
          {selectedTalent && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                type="button"
                className="tvp-link"
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                onClick={() => setFolderSel(null)}
              >
                {selectedTalent.displayName}
              </button>
            </>
          )}
          {folderSel && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <strong style={{ color: "var(--tvp-ink)" }}>{folderSel.label}</strong>
              {folderSel.restricted && (
                <span className="tvp-status tvp-amber" style={{ marginLeft: 4 }}>
                  <Lock className="h-3 w-3" /> Restricted
                </span>
              )}
            </>
          )}
        </div>
      )}

      {tab === "Requests" ? (
        <VaultRequestsPanel
          autoOpenNew={requestsAutoOpen}
          onAutoOpenConsumed={() => setRequestsAutoOpen(false)}
        />
      ) : (
      <div className="tvp-stack">
        {showTalentPicker && (
          <div className="tvp-card">
            <h2 className="tvp-h2" style={{ marginBottom: 2 }}>Select a talent</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 0 }}>
              Open a talent to browse their folders, or search across the whole roster.
            </p>
            {talentLinks.length === 0 ? (
              <div className="tvp-callout" style={{ marginTop: 12 }}>
                <div className="tvp-callout-icon tvp-bg-purple"><UsersIcon className="h-4 w-4" /></div>
                <div>
                  <strong>No talent on your roster yet.</strong>{" "}
                  <span className="tvp-muted">Invite your first talent and their folders will appear here.</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 12, alignItems: "start" }}>
                {talentLinks.map((l) => {
                  const stats = summaryByTalent.get(l.id);
                  const totalDocsForTalent = stats?.docCount ?? 0;
                  const folderTotal = stats?.folderCount ?? 0;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="tvp-folder-card"
                      style={{ padding: 14, alignItems: "flex-start", textAlign: "left", cursor: "pointer" }}
                      onClick={() => pickTalent(l.id)}
                    >
                      <strong style={{ fontSize: 14 }}>{l.displayName}</strong>
                      <span className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {folderTotal} {folderTotal === 1 ? "folder" : "folders"} · {totalDocsForTalent} {totalDocsForTalent === 1 ? "document" : "documents"}
                      </span>
                      <span style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {l.status !== "active" && (
                          <span className="tvp-status tvp-amber" style={{ textTransform: "capitalize" }}>{l.status}</span>
                        )}
                        {(stats?.reviewCount ?? 0) > 0 && (
                          <span className="tvp-status tvp-purple">{stats?.reviewCount} to review</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showFolderGrid && (
          <div className="tvp-card">
            <h2 className="tvp-h2" style={{ marginBottom: 2 }}>{selectedTalent?.displayName}'s folders</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 0 }}>
              Provisioned from Manage folders. Open a category, or drill into a subfolder.
            </p>
            {foldersLoading ? (
              <div className="tvp-muted" style={{ padding: 16 }}>Loading folders…</div>
            ) : categories.length === 0 ? (
              <div className="tvp-callout" style={{ marginTop: 12 }}>
                <div className="tvp-callout-icon tvp-bg-purple"><FolderOpen className="h-4 w-4" /></div>
                <div>
                  <strong>No folders provisioned for this talent.</strong>{" "}
                  <span className="tvp-muted">Set their folder list under Agency profile → Manage folders.</span>
                </div>
              </div>
            ) : (
              <div className="tvp-folder-tree">
                {categories.map((c) => {
                  const Icon = FOLDER_META[c.folder.folderName]?.icon ?? FolderOpen;
                  const open = openCategory === c.folder.id;
                  return (
                    <div key={c.folder.id} className={`tvp-folder-card${open ? " tvp-open" : ""}`}>
                      <button
                        type="button"
                        className="tvp-folder-head"
                        onClick={() => setOpenCategory(open ? null : c.folder.id)}
                      >
                        <span className="tvp-callout-icon tvp-bg-teal"><Icon className="h-4 w-4" /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="tvp-folder-name">
                            {c.folder.folderName}
                            {c.folder.restricted && <Lock className="inline h-3 w-3 ml-1" />}
                          </span>
                          <span className="tvp-folder-meta" style={{ display: "block" }}>
                            {c.count} {c.count === 1 ? "document" : "documents"}
                            {c.children.length > 0 && ` · ${c.children.length} subfolders`}
                          </span>
                          <span style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                            {c.reviewCount > 0 && <span className="tvp-status tvp-purple">{c.reviewCount} to review</span>}
                            {c.expiringCount > 0 && <span className="tvp-status tvp-amber">{c.expiringCount} expiring</span>}
                            {c.needsReview && <span className="tvp-status tvp-amber">Folder needs review</span>}
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 tvp-folder-chevron" />
                      </button>
                      <div className="tvp-folder-body">
                        <div>
                          <div className="tvp-folder-body-inner">
                            <button
                              type="button"
                              className="tvp-secondary"
                              style={{ justifyContent: "flex-start" }}
                              onClick={() => setFolderSel({ label: c.folder.folderName, names: c.names, restricted: c.folder.restricted })}
                            >
                              <FolderOpen className="h-4 w-4" />Open all in this category
                            </button>
                            {c.children.length > 0 && (
                              <div className="tvp-subfolder-list">
                                {c.children.map((s) => {
                                  const n = countsByFolder.get(s.folderName)?.docCount ?? 0;
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className="tvp-subfolder-pill"
                                      onClick={() => setFolderSel({ label: `${c.folder.folderName} · ${s.folderName}`, names: [s.folderName], restricted: s.restricted })}
                                    >
                                      {s.restricted && <Lock className="h-3 w-3" />}
                                      {s.folderName}
                                      <span className="tvp-muted" style={{ fontSize: 11, marginLeft: 4 }}>{n}</span>
                                      {s.needsReview && <span className="tvp-status tvp-amber" style={{ marginLeft: 4 }}>Review</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showTable && (
        <div className="tvp-card">
          {mode === "search" && (
            <div className="tvp-toolbar">
              <input
                className="tvp-search"
                placeholder="Search every document, talent or folder..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex gap-2">
                <select className="tvp-select" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
                  <option value="all">Folder: All</option>
                  {folderOptions.map((f: string) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className="tvp-select" value={talentFilter} onChange={(e) => setTalentFilter(e.target.value)}>
                  <option value="all">Talent: All</option>
                  {talentLinks.map((l) => <option key={l.id} value={l.id}>{l.displayName}</option>)}
                </select>
              </div>
            </div>
          )}
          {page.total === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="tvp-muted">
              {mode === "search"
                ? "No documents match your search — try a different term or clear the filters."
                : "Nothing here yet — use “Upload to Talent” to add the first document."}
            </div>
          ) : (
            <table className="tvp-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Talent</th>
                  <th>Folder</th>
                  <th>Status</th>
                  <th>Validity</th>
                  <th style={{ width: 200 }}></th>
                </tr>
              </thead>
              <tbody>
                {page.visible.map((d) => {
                  const isLocked = !!d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now();
                  const lockDate = d.lockedUntil ? new Date(d.lockedUntil).toLocaleDateString() : "";
                  return (
                  <tr key={d.id}>
                    <td>
                      <FileText className="inline h-4 w-4 mr-2 text-[var(--tvp-muted)]" />
                      {d.folder === "Contracts & Agreements" ? (
                        <Link to="/agency/contracts/$id" params={{ id: d.id }} className="tvp-link">
                          <strong>{d.name}</strong>
                        </Link>
                      ) : (
                        <strong>{d.name}</strong>
                      )}
                      {isLocked && (
                        <span
                          title={`Locked by retention rule until ${lockDate} — cannot be deleted.`}
                          style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--tvp-amber, #b45309)", fontSize: 12 }}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Locked · {lockDate}
                        </span>
                      )}
                    </td>
                    <td>{d.talentName}</td>
                    <td>{d.folder}</td>
                    <td>
                      <span className={`tvp-status tvp-${statusTone(d.status)}`}>{statusLabel(d.status)}</span>
                      {d.pendingReview && (
                        <span className="tvp-status tvp-purple" style={{ marginLeft: 6 }}>Pending review</span>
                      )}
                    </td>
                    <td className="tvp-muted">{formatValidity(d.validityExpiresAt)}</td>
                    <td>
                      <div className="tvp-row-actions">
                        <RowActionsMenu
                          actions={[
                            {
                              key: "view", label: "View document", icon: Eye,
                              disabled: !d.storagePath || viewMut.isPending,
                              title: d.storagePath ? undefined : "No file attached to this document",
                              onSelect: () => viewMut.mutate(d.id),
                            },
                            {
                              key: "download", label: "Download document", icon: Download,
                              disabled: !d.storagePath || downloadMut.isPending,
                              onSelect: () => downloadMut.mutate(d.id),
                            },
                            d.pendingReview && {
                              key: "review", label: "Finish filing review", icon: Sparkles,
                              onSelect: () => setAiReviewFor({ id: d.id, name: d.name }),
                            },
                            {
                              key: "versions", label: "Version history", icon: History,
                              separatorBefore: true,
                              onSelect: () => setVersionsFor(d),
                            },
                            {
                              key: "newversion", label: "Upload new version", icon: Upload,
                              onSelect: () => setNewVersionFor(d),
                            },
                            isOwner && {
                              key: "retention", label: "Set retention override", icon: ShieldPlus,
                              onSelect: () => setOverrideFor(d),
                            },
                            {
                              key: "delete", label: "Delete document", icon: Trash2,
                              destructive: true, separatorBefore: true,
                              disabled: isLocked || deleteMut.isPending,
                              title: isLocked ? `Locked until ${lockDate}` : undefined,
                              onSelect: () => {
                                if (confirm(`Delete "${d.name}"? This removes the file and all versions.`)) {
                                  deleteMut.mutate(d.id);
                                }
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
                <LoadMoreRow
                  colSpan={7}
                  noun="documents"
                  shown={page.shown}
                  total={page.total}
                  hasMore={page.hasMore}
                  onLoadMore={page.loadMore}
                />
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>
      )}

      {showUpload && (
        <UploadDialog
          agencyId={me.agency?.id ?? ""}
          talentLinks={talentLinks}
          onClose={() => setShowUpload(false)}
          onDone={(doc) => {
            setShowUpload(false);
            qc.invalidateQueries({ queryKey: ["agency", "vault"] });
            if (doc) setAiReviewFor(doc);
          }}
          registerFn={registerFn}
        />
      )}

      {aiReviewFor && (
        <AiFilingReviewModal
          scope="agency"
          documentId={aiReviewFor.id}
          documentName={aiReviewFor.name}
          destinationPrefix="Roster Shared Folder"
          onClose={() => setAiReviewFor(null)}
          onDone={() => {
            setAiReviewFor(null);
            qc.invalidateQueries({ queryKey: ["agency", "vault"] });
          }}
        />
      )}

      {preview && <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}

      {versionsFor && (
        <VersionsDialog
          doc={versionsFor}
          onClose={() => setVersionsFor(null)}
        />
      )}

      {newVersionFor && (
        <NewVersionDialog
          doc={newVersionFor}
          agencyId={me.agency?.id ?? ""}
          onClose={() => setNewVersionFor(null)}
          onDone={() => {
            setNewVersionFor(null);
            qc.invalidateQueries({ queryKey: ["agency", "vault"] });
          }}
        />
      )}

      {overrideFor && (
        <OverrideDialog
          doc={overrideFor}
          onClose={() => setOverrideFor(null)}
          onSave={async (years, description) => {
            try {
              await upsertRuleFn({
                data: {
                  scope: "document",
                  document_id: overrideFor.id,
                  retention_years: years,
                  description: description || null,
                },
              });
              toast.success("Retention override set");
              qc.invalidateQueries({ queryKey: ["agency", "vault"] });
              qc.invalidateQueries({ queryKey: ["agency", "retention"] });
              setOverrideFor(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            }
          }}
        />
      )}
    </>
  );
}

function inferKind(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  return "other";
}

function PreviewDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const kind = inferKind(name);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tvp-card"
        style={{ width: "min(1100px, 100%)", height: "min(85vh, 900px)", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--tvp-border, #e5e7eb)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <FileText className="h-4 w-4 text-[var(--tvp-muted)]" />
            <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          </div>
          <div className="flex gap-2">
            <a className="tvp-secondary" href={url} target="_blank" rel="noopener" download={name}>
              <Download className="h-4 w-4" />Download
            </a>
            <button className="tvp-mini-btn" title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, background: "#0f172a08", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {kind === "pdf" && (
            <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: 0, background: "white" }} />
          )}
          {kind === "image" && (
            <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          )}
          {kind === "other" && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--tvp-muted)]" />
              <h3 className="tvp-h2">Preview not available</h3>
              <p className="tvp-muted" style={{ marginTop: 6, marginBottom: 16 }}>
                This file type can't be rendered inline in the browser.
              </p>
              <a className="tvp-primary" href={url} target="_blank" rel="noopener" download={name}>
                <Download className="h-4 w-4" />Download to open
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  agencyId,
  talentLinks,
  onClose,
  onDone,
  registerFn,
}: {
  agencyId: string;
  talentLinks: { id: string; displayName: string; status: string }[];
  onClose: () => void;
  onDone: (doc?: { id: string; name: string }) => void;
  registerFn: ReturnType<typeof useServerFn<typeof registerAgencyVaultDocument>>;
}) {
  const catalogue = useFolderCatalogue();
  const allowedFolderMeta = allowedFoldersFrom(catalogue.categories);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [talentLinkId, setTalentLinkId] = useState<string>(
    talentLinks.find((l) => l.status !== "ended")?.id ?? "",
  );
  const [folder, setFolder] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [status, setStatus] = useState<"filed" | "needs_review" | "ai_suggested">("needs_review");
  const [expiry, setExpiry] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const listFoldersFn = useServerFn(listAgencyTalentFolders);
  const { data: allowedFolders, isLoading: foldersLoading } = useQuery({
    queryKey: ["agency", "vault", "talent-folders", talentLinkId],
    queryFn: () => listFoldersFn({ data: { talent_link_id: talentLinkId } }),
    enabled: !!talentLinkId,
  });

  // Reset folder selection when talent changes
  const folderKeys = (allowedFolders ?? []).map((f: { folderName: string }) => f.folderName).join("|");
  useMemo(() => {
    if (allowedFolders && allowedFolders.length > 0) {
      if (!allowedFolders.find((f: { folderName: string }) => f.folderName === folder)) {
        setFolder(allowedFolders[0].folderName);
      }
    } else {
      setFolder("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKeys]);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !displayName) setDisplayName(f.name.replace(/\.[^.]+$/, ""));
  }

  function humanSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Pick a file first");
    if (!agencyId) return toast.error("No agency context");
    if (!talentLinkId) return toast.error("Select a talent");
    if (!folder) return toast.error("Select an allowed destination folder");
    if (!(allowedFolders ?? []).some((f: { folderName: string }) => f.folderName === folder)) {
      return toast.error("That folder isn't allowed for this talent");
    }

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${agencyId}/${talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("talent-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      const ext = file.name.match(/\.[^.]+$/)?.[0] ?? "";
      const finalName = displayName.trim()
        ? (displayName.trim().endsWith(ext) ? displayName.trim() : displayName.trim() + ext)
        : file.name;

      const inserted: any = await registerFn({
        data: {
          name: finalName,
          folder,
          storage_path: path,
          talent_link_id: talentLinkId || null,
          status,
          validity_expires_at: expiry ? new Date(expiry).toISOString() : null,
          mime_type: file.type || null,
        },
      });

      toast.success("Uploaded");
      onDone(inserted?.id ? { id: inserted.id as string, name: finalName } : undefined);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "var(--tvp-ink, #0f172a)",
    textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4,
  };
  const groupStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 0, marginTop: 4 };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div>
          <h2 className="tvp-h2" style={{ margin: 0 }}>Upload document</h2>
          <div className="tvp-muted" style={{ fontSize: 13, marginTop: 2 }}>
            Files land in the talent's Roster Shared Folder.
          </div>
        </div>

        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(180, 83, 9, 0.08)",
            border: "1px solid rgba(180, 83, 9, 0.25)",
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--tvp-amber, #b45309)", marginTop: 2 }} />
          <div style={{ fontSize: 13 }}>
            <strong>Managers can only upload to the Roster Shared Folder.</strong>
            <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
              Talent's Private Vault (Family, Medical, Personal Finance) is shown below as locked so you can see the access boundary — those folders are for the talent only.
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div style={groupStyle}>
          <div style={labelStyle}>File</div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) pickFile(f);
            }}
            role="button"
            tabIndex={0}
            style={{
              border: `1.5px dashed ${dragOver ? "#2563eb" : "var(--tvp-border, #cbd5e1)"}`,
              background: dragOver ? "rgba(37, 99, 235, 0.06)" : "rgba(15, 23, 42, 0.02)",
              borderRadius: 10, padding: file ? "12px 14px" : "22px 14px",
              cursor: "pointer", transition: "all 120ms ease",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            {file ? (
              <>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "rgba(37, 99, 235, 0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#2563eb", flexShrink: 0,
                  }}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12 }}>
                    {humanSize(file.size)} · click to replace
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); pickFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="tvp-secondary"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(37, 99, 235, 0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#2563eb", flexShrink: 0,
                  }}
                >
                  <Upload className="h-5 w-5" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Drop a file here, or <span style={{ color: "#2563eb" }}>browse</span>
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    PDF, image, or document · up to 20 MB
                  </div>
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {/* Talent */}
        <div style={groupStyle}>
          <div style={labelStyle}>Talent</div>
          <select className="tvp-select" value={talentLinkId} onChange={(e) => setTalentLinkId(e.target.value)}>
            <option value="">Select talent…</option>
            {talentLinks.map((l) => (
              <option key={l.id} value={l.id} disabled={l.status === "ended"}>
                {l.displayName}{l.status === "ended" ? " (ended — new uploads blocked)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Destination folder — no redundant talent-name suffix */}
        <div style={groupStyle}>
          <div style={labelStyle}>Destination folder</div>
          <div className="tvp-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Roster Shared Folder · Allowed
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {!talentLinkId ? (
              <div className="tvp-muted" style={{ fontSize: 12, padding: "8px 4px" }}>
                Select a talent to see their allowed destinations.
              </div>
            ) : foldersLoading ? (
              <div className="tvp-muted" style={{ fontSize: 12, padding: "8px 4px" }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading folders…
              </div>
            ) : (allowedFolders ?? []).length === 0 ? (
              <div
                style={{
                  fontSize: 12, padding: "10px 12px", borderRadius: 8,
                  background: "rgba(180, 83, 9, 0.08)",
                  border: "1px solid rgba(180, 83, 9, 0.25)",
                }}
              >
                <strong>This talent has no folders yet.</strong>
                <div className="tvp-muted" style={{ marginTop: 2 }}>
                  Set one up under <Link to="/agency/folder-templates" className="tvp-link">Folder Templates</Link>{" "}
                  or re-invite with a folder selection.
                </div>
              </div>
            ) : (
              (allowedFolders ?? []).map((f: { id: string; folderName: string }) => {
                const meta = allowedFolderMeta.find((m) => m.key === f.folderName);
                const Icon = meta?.icon ?? FileText;
                const active = folder === f.folderName;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFolder(f.folderName)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 8, textAlign: "left",
                      background: active ? "rgba(37, 99, 235, 0.08)" : "white",
                      border: `1px solid ${active ? "rgba(37, 99, 235, 0.5)" : "var(--tvp-border, #e5e7eb)"}`,
                      cursor: "pointer",
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: active ? "#2563eb" : "var(--tvp-muted)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{f.folderName}</div>
                      {meta?.description && (
                        <div className="tvp-muted" style={{ fontSize: 12 }}>{meta.description}</div>
                      )}
                    </div>
                    <span className="tvp-status tvp-green" style={{ fontSize: 11 }}>Allowed</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="tvp-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 12, marginBottom: 2 }}>
            Talent Private Vault · Read-only to you
          </div>
          <div className="tvp-muted" style={{ fontSize: 11, marginBottom: 6 }}>
            Representative list — the Talent Portal isn't wired yet, so these aren't per-talent real folders.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: 0.65 }}>
            {BLOCKED_FOLDERS.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.key}
                  title="This folder lives in the talent's Private Vault. Managers cannot upload here."
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(15, 23, 42, 0.04)",
                    border: "1px dashed var(--tvp-border, #cbd5e1)",
                    cursor: "not-allowed",
                  }}
                >
                  <Icon className="h-4 w-4 text-[var(--tvp-muted)]" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      <Lock className="h-3.5 w-3.5" /> {f.label}
                    </div>
                    <div className="tvp-muted" style={{ fontSize: 12 }}>{f.description}</div>
                  </div>
                  <span className="tvp-status tvp-amber" style={{ fontSize: 11 }}>Blocked</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Optional name override */}
        <div style={groupStyle}>
          <div style={labelStyle}>Document name <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--tvp-muted)" }}>(optional)</span></div>
          <input
            className="tvp-select"
            type="text"
            placeholder={file?.name ?? "Defaults to file name"}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {/* Status + Expiry side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={groupStyle}>
            <div style={labelStyle}>Status</div>
            <select className="tvp-select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="needs_review">Needs review</option>
              <option value="filed">Filed</option>
              <option value="ai_suggested">AI suggested</option>
            </select>
          </div>
          <div style={groupStyle}>
            <div style={labelStyle}>Expiry <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--tvp-muted)" }}>(optional)</span></div>
            <input className="tvp-select" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy || !file || !talentLinkId || !folder}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version history dialog
// ---------------------------------------------------------------------------
function VersionsDialog({ doc, onClose }: { doc: VaultDoc; onClose: () => void }) {
  const listFn = useServerFn(listAgencyDocumentVersions);
  const signedFn = useServerFn(getAgencyVersionSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["agency", "vault", "versions", doc.id],
    queryFn: () => listFn({ data: { document_id: doc.id } }),
  });
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  async function open(versionId: string, disposition: "inline" | "attachment") {
    try {
      const { url, name } = await signedFn({ data: { version_id: versionId, disposition } });
      if (disposition === "inline") setPreview({ url, name });
      else window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open version");
    }
  }

  const versions = data?.versions ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tvp-card"
        style={{ width: "min(800px, 100%)", padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="tvp-h2">Version history</h2>
            <div className="tvp-muted" style={{ fontSize: 13 }}>{doc.name}</div>
          </div>
          <button className="tvp-mini-btn" onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
        </div>

        {isLoading ? (
          <div className="tvp-muted" style={{ padding: 24, textAlign: "center" }}>
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
          </div>
        ) : versions.length === 0 ? (
          <p className="tvp-muted" style={{ padding: 12 }}>
            Only the current file exists. New uploads under "Upload new version" will appear here.
          </p>
        ) : (
          <table className="tvp-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>File name</th>
                <th>Uploaded</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v: any) => (
                <tr key={v.id}>
                  <td><strong>v{v.version_number}</strong>{data?.currentVersionId === v.id ? " · current" : ""}</td>
                  <td>{v.name}</td>
                  <td className="tvp-muted">{new Date(v.created_at).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="tvp-mini-btn" title="View" onClick={() => open(v.id, "inline")}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="tvp-mini-btn" title="Download" onClick={() => open(v.id, "attachment")}>
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {preview && <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New version upload dialog
// ---------------------------------------------------------------------------
function NewVersionDialog({
  doc, agencyId, onClose, onDone,
}: { doc: VaultDoc; agencyId: string; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const registerVersion = useServerFn(registerAgencyDocumentVersion);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file first");
    if (!agencyId) return toast.error("No agency context");

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${agencyId}/${doc.talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("talent-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      await registerVersion({
        data: {
          document_id: doc.id,
          storage_path: path,
          name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
        },
      });
      toast.success("New version uploaded");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{ width: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Upload new version</h2>
        <p className="tvp-muted" style={{ fontSize: 13 }}>
          Replacing "{doc.name}" — the previous file is preserved in version history.
        </p>
        <label className="tvp-muted" style={{ fontSize: 13 }}>File</label>
        <input ref={fileRef} type="file" required />
        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload version
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-document retention override dialog
// ---------------------------------------------------------------------------
function OverrideDialog({
  doc, onClose, onSave,
}: {
  doc: VaultDoc;
  onClose: () => void;
  onSave: (years: number, description: string) => Promise<void>;
}) {
  const [years, setYears] = useState<number>(5);
  const [description, setDescription] = useState<string>("");
  const [busy, setBusy] = useState(false);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(Number(years), description); } finally { setBusy(false); } }}
        className="tvp-card"
        style={{ width: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">Set retention override</h2>
        <p className="tvp-muted" style={{ fontSize: 13 }}>
          Locks "{doc.name}" from deletion for the specified number of years from its upload date.
          This overrides any folder-level rule for this document.
        </p>
        <label className="tvp-muted" style={{ fontSize: 13 }}>Retention (years)</label>
        <input
          className="tvp-select"
          type="number"
          min={0}
          max={100}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          required
        />
        <label className="tvp-muted" style={{ fontSize: 13 }}>Description (optional)</label>
        <input
          className="tvp-select"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>Set override</button>
        </div>
      </form>
    </div>
  );
}
