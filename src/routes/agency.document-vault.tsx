import { FilterBar } from "@/components/shared/filter-bar";
import { useConfirm } from "@/components/shared/use-confirm";
import {
  agencyDocumentChangeBlock,
  agencyDocumentDeleteBlock,
  blockText,
  fmtLongDate,
} from "@/lib/document-blocks";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RecentlyDeletedDialog } from "@/components/agency/recently-deleted-dialog";
import { stopSharingConfirmText } from "@/lib/document-settings";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FolderOpen,
  Sparkles,
  FileText,
  Files,
  Trash2,
  Download,
  Eye,
  X,
  Loader2,
  Lock,
  History,
  ShieldPlus,
  Search,
  ChevronRight,
  ChevronDown,
  FileSignature,
  Award,
  Receipt,
  IdCard,
  Users as UsersIcon,
  HeartPulse,
  Inbox,
  CalendarClock,
  RefreshCw,
  Plane,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  useInfiniteQuery,
  queryOptions,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgencyVaultDocuments,
  getAgencyVaultTalentSummary,
  getAgencyVaultFolderCounts,
  listAgencyTalentLinksLite,
  listAgencyTalentFolders,
  registerAgencyVaultDocument,
  getAgencyVaultSignedUrl,
  deleteAgencyVaultDocument,
  stopSharingDocument,
  agencyWhoami,
  listAgencyDocumentVersions,
  registerAgencyDocumentVersion,
  getAgencyVersionSignedUrl,
} from "@/lib/agency.functions";
import { useFolderNames } from "@/lib/folder-catalogue";
import { suggestFromFileName } from "@/lib/filing-heuristics";
import { getAiFilingPreference } from "@/lib/ai-filing.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EntityCard } from "@/components/shared/entity-card";
import { statusLabel as lifecycleLabel, statusPillClass } from "@/lib/status-labels";

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
  originator?: string;
  linkStatus?: string | null;
  quarantineReason?: QuarantineReason | null;
};
type TalentLinkLite = {
  id: string;
  displayName: string;
  status: string;
  talentType: string | null;
  avatarUrl: string | null;
};
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

import {
  VaultRequestsPanel,
  requestsListQO,
  requestsTalentQO,
} from "@/components/agency/vault-requests-panel";
import { AiFilingReviewModal } from "@/components/shared/ai-filing-review-modal";
import { useAnalyseWithAi } from "@/components/shared/use-analyse-with-ai";
import { useAgencyReadOnly } from "@/components/agency/agency-read-only";
import { PreviewDialog } from "@/components/shared/preview-dialog";
import { PAGE_SIZE } from "@/lib/pagination";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import {
  BlockedDocumentPill,
  blockedReason,
  explainBlocked,
} from "@/components/shared/blocked-document";
import { quarantineReason, type QuarantineReason } from "@/lib/document-quarantine";
import { LoadMoreRow } from "@/components/shared/load-more";
import { friendlyError } from "@/lib/friendly-error";

const talentSummaryQO = queryOptions({
  queryKey: ["agency", "vault", "talent-summary"],
  queryFn: () => getAgencyVaultTalentSummary() as Promise<TalentSummary[]>,
});
const talentLinksQO = queryOptions({
  queryKey: ["agency", "vault", "talent-links"],
  queryFn: () => listAgencyTalentLinksLite() as Promise<TalentLinkLite[]>,
});
const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn: () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/document-vault")({
  head: () => ({
    meta: [
      { title: "Document Vault · TalVault" },
      {
        name: "description",
        content: "Browse and review agency-shared talent documents in TalVault.",
      },
      { property: "og:title", content: "Document Vault · TalVault" },
      {
        property: "og:description",
        content: "Browse and review agency-shared talent documents in TalVault.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: string; doc?: string; talent?: string } => ({
    ...(typeof search.talent === "string" && search.talent ? { talent: search.talent } : {}),
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...(typeof search.doc === "string" && search.doc ? { doc: search.doc } : {}),
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(talentSummaryQO),
      context.queryClient.ensureQueryData(talentLinksQO),
      context.queryClient.ensureQueryData(meQO),
      context.queryClient.ensureQueryData(requestsListQO),
      context.queryClient.ensureQueryData(requestsTalentQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Document Vault</h1>
      <p className="tvp-muted">
        {friendlyError(error, "This page could not be loaded. Please try again.")}
      </p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: VaultPage,
});

const tabs = [
  "All Documents",
  "Pending Review",
  "Needs Review",
  "Expiring",
  "Recently Updated",
  "Requests",
] as const;
type Tab = (typeof tabs)[number];
const FOLDER_META: Record<string, { description: string; icon: LucideIcon }> = {
  "Identity & Personal": { description: "Passport, ID, visa, work authorisation", icon: IdCard },
  "Contracts & Agreements": { description: "Agreements, riders, addenda", icon: FileSignature },
  "Banking, Tax & Financial": { description: "Invoices, tax and banking records", icon: Receipt },
  "Travel & Visas": { description: "Itineraries, visas, travel approvals", icon: Plane },
  "Medical, Fitness & Insurance": {
    description: "Clearances, cover, fitness records",
    icon: HeartPulse,
  },
  "Career & Professional Records": {
    description: "CVs, accreditations, career history",
    icon: Briefcase,
  },
  "Brand, Sponsorship & Media": { description: "Brand deals, partnerships, media", icon: Award },
  "Bookings, Events & Appearances": {
    description: "Bookings, call sheets, appearances",
    icon: CalendarClock,
  },
  "Rights, Licences & Compliance": {
    description: "Licences, certifications, compliance",
    icon: ShieldPlus,
  },
};

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
      listAgencyTalentFolders({ data: { talent_link_id: talentLinkId! } }) as Promise<
        ProvisionedFolder[]
      >,
    enabled: !!talentLinkId,
  });

const folderCountsQO = (talentLinkId: string | null) =>
  queryOptions({
    queryKey: ["agency", "vault", "folder-counts", talentLinkId],
    queryFn: () =>
      getAgencyVaultFolderCounts({ data: { talent_link_id: talentLinkId! } }) as Promise<
        FolderCount[]
      >,
    enabled: !!talentLinkId,
  });

/** Maps the visible tab onto the server-side filter the API understands. */
const TAB_FILTER: Record<
  Tab,
  "all" | "pending_review" | "needs_review" | "expiring" | "recently_updated"
> = {
  "All Documents": "all",
  "Pending Review": "pending_review",
  "Needs Review": "needs_review",
  Expiring: "expiring",
  "Recently Updated": "recently_updated",
  Requests: "all",
};

function VaultPage() {
  const qc = useQueryClient();
  const readOnly = !!useAgencyReadOnly();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const folderOptions = useFolderNames();
  const { data: talentLinks } = useSuspenseQuery(talentLinksQO);
  const { data: me } = useSuspenseQuery(meQO);
  const { data: requestRows } = useSuspenseQuery(requestsListQO);
  const { data: talentSummary = [] } = useSuspenseQuery(talentSummaryQO);
  const searchParams = Route.useSearch();
  const initialTab: Tab = (tabs as readonly string[]).includes(searchParams.tab ?? "")
    ? (searchParams.tab as Tab)
    : "All Documents";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [requestsAutoOpen, setRequestsAutoOpen] = useState(false);

  // Keep the tab in step with the URL so links (and guided walkthroughs) can
  // open a specific tab on a page that is already mounted.
  useEffect(() => {
    const t = searchParams.tab;
    if (t && (tabs as readonly string[]).includes(t)) setTab(t as Tab);
  }, [searchParams.tab]);

  const needsActionCount = useMemo(
    () => requestRows.filter((r) => r.status === "pending" || r.status === "submitted").length,
    [requestRows],
  );

  const [mode, setMode] = useState<"browse" | "search">("browse");
  // `?talent=` opens a talent's folders directly (used by the talent details page).
  const [talentId, setTalentId] = useState<string | null>(searchParams.talent ?? null);
  useEffect(() => {
    if (searchParams.talent) setTalentId(searchParams.talent);
  }, [searchParams.talent]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [folderSel, setFolderSel] = useState<{
    label: string;
    names: string[];
    restricted: boolean;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [talentFilter, setTalentFilter] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [versionsFor, setVersionsFor] = useState<VaultDoc | null>(null);
  const [versionsCanUpload, setVersionsCanUpload] = useState(false);
  const [newVersionFor, setNewVersionFor] = useState<VaultDoc | null>(null);
  const [aiReviewFor, setAiReviewFor] = useState<{ id: string; name: string } | null>(null);
  const aiRow = useAnalyseWithAi("agency");

  const isOwner = me?.role === "owner";

  const registerFn = useServerFn(registerAgencyVaultDocument);
  const signedFn = useServerFn(getAgencyVaultSignedUrl);
  const deleteFn = useServerFn(deleteAgencyVaultDocument);
  const stopSharingFn = useServerFn(stopSharingDocument);
  const [showDeleted, setShowDeleted] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Moved to Recently deleted");
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
    onError: (e) => {
      toast.error(friendlyError(e, "This document couldn't be deleted. Please try again."));
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
  });

  const viewMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "inline" } }),
    onSuccess: ({ url, name }) => setPreview({ url, name }),
    onError: (e) =>
      toast.error(friendlyError(e, "This document is no longer available to you.")),
  });

  // Deep link from a bell notification: open the document straight away, or
  // say clearly when it is no longer available (deleted, access changed).
  const navigate = useNavigate();
  const docParam = (searchParams as { doc?: string }).doc;
  useEffect(() => {
    if (!docParam) return;
    navigate({ to: "/agency/document-vault", search: {}, replace: true });
    viewMut.mutate(docParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam]);

  const downloadMut = useMutation({
    mutationFn: (id: string) => signedFn({ data: { id, disposition: "attachment" } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
    onError: (e) => toast.error(friendlyError(e, "Could not download file")),
  });

  // ---- Folder tree for the selected talent, live from agency_talent_folders ----
  const { data: talentFolders = [], isLoading: foldersLoading } = useQuery(
    talentFoldersQO(talentId),
  );
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
      {confirmDialog}
      {showDeleted && <RecentlyDeletedDialog onClose={() => setShowDeleted(false)} />}
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Document Vault</h1>
        </div>
        <div className="tvp-actions" data-tour="vault-actions">
          {isOwner && (
            <button className="tvp-secondary" onClick={() => setShowDeleted(true)}>
              <Trash2 className="h-4 w-4" /> Recently deleted
            </button>
          )}
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
          {!readOnly && (
            <button
              className="tvp-purple-btn"
              title="Ask a talent to submit a specific document"
              onClick={() => {
                setRequestsAutoOpen(true);
                setTab("Requests");
              }}
            >
              <Inbox className="h-4 w-4" />
              Request Document
            </button>
          )}
          {!readOnly && (
            <button className="tvp-primary" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" />
              Upload to Talent
            </button>
          )}
        </div>
      </div>

      <div className="tvp-tabs" data-tour="vault-tabs">
        {tabs.map((t) => {
          const isRequests = t === "Requests";
          if (isRequests && mode === "search") return null;
          const iconMap: Record<Tab, { Icon: typeof Files; color: string }> = {
            "All Documents": { Icon: Files, color: "var(--tvp-teal)" },
            "Pending Review": { Icon: Sparkles, color: "var(--tvp-purple, #7c3aed)" },
            "Needs Review": { Icon: Eye, color: "var(--tvp-teal)" },
            Expiring: { Icon: CalendarClock, color: "var(--tvp-amber)" },
            "Recently Updated": { Icon: RefreshCw, color: "var(--tvp-teal)" },
            Requests: { Icon: Inbox, color: "var(--tvp-purple, #7c3aed)" },
          };
          const { Icon, color } = iconMap[t];
          const label: Record<Tab, string> = {
            "All Documents": mode === "search" ? "All results" : "Browse",
            "Pending Review": "Pending review",
            "Needs Review": "Needs review",
            Expiring: "Expiring",
            "Recently Updated": "Recently updated",
            Requests: "Requests",
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
        <div className="tvp-breadcrumb tvp-vault-breadcrumb">
          <button
            type="button"
            className="tvp-link"
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onClick={() => {
              setTalentId(null);
              setFolderSel(null);
              setOpenCategory(null);
            }}
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
        <div className="tvp-stack" data-tour="vault-panes">
          {showTalentPicker && (
            <div className="tvp-card tvp-panel">
              <div className="tvp-panel-head">
                <div>
                  <h2 className="tvp-h2">Select a talent</h2>
                  <p className="tvp-subtitle">
                    Open a talent to browse their folders, or search across the whole roster.
                  </p>
                </div>
              </div>
              {talentLinks.length === 0 ? (
                <div className="tvp-callout">
                  <div className="tvp-callout-icon tvp-bg-purple">
                    <UsersIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <strong>No talent on your roster yet.</strong>{" "}
                    <span className="tvp-muted">
                      Invite your first talent and their folders will appear here.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="tvp-entity-grid tvp-entity-grid-compact tvp-vault-picker">
                  {talentLinks.map((l) => {
                    const stats = summaryByTalent.get(l.id);
                    const totalDocsForTalent = stats?.docCount ?? 0;
                    const folderTotal = stats?.folderCount ?? 0;
                    return (
                      <EntityCard
                        key={l.id}
                        compact
                        name={l.displayName}
                        avatarSeed={l.id}
                        photoUrl={l.avatarUrl}
                        subtitle={l.talentType ?? "Talent type not set"}
                        meta={`${folderTotal} ${folderTotal === 1 ? "folder" : "folders"} · ${totalDocsForTalent} ${totalDocsForTalent === 1 ? "document" : "documents"}`}
                        ariaLabel={`Open ${l.displayName}'s folders`}
                        onClick={() => pickTalent(l.id)}
                        pills={
                          <>
                            <span className={statusPillClass("talentLink", l.status)}>
                              {lifecycleLabel("talentLink", l.status)}
                            </span>
                            {(stats?.reviewCount ?? 0) > 0 && (
                              <span className="tvp-status tvp-purple">
                                {stats?.reviewCount} to review
                              </span>
                            )}
                          </>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showFolderGrid && (
            <div className="tvp-card tvp-panel">
              <h2 className="tvp-h2">{selectedTalent?.displayName}'s folders</h2>
              <p className="tvp-muted tvp-section-desc">
                Open a folder to see its documents and subfolders.
              </p>
              {foldersLoading ? (
                <div className="tvp-muted" style={{ padding: 16 }}>
                  Loading folders…
                </div>
              ) : categories.length === 0 ? (
                <div className="tvp-callout" style={{ marginTop: 12 }}>
                  <div className="tvp-callout-icon tvp-bg-purple">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <strong>No folders provisioned for this talent.</strong>{" "}
                    <span className="tvp-muted">
                      Set their folder list under Agency profile → Manage folders.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="tvp-folder-tree">
                  {categories.map((c) => {
                    const Icon = FOLDER_META[c.folder.folderName]?.icon ?? FolderOpen;
                    const open = openCategory === c.folder.id;
                    return (
                      <div
                        key={c.folder.id}
                        className={`tvp-folder-card${open ? " tvp-open" : ""}`}
                      >
                        <button
                          type="button"
                          className="tvp-folder-head"
                          onClick={() => setOpenCategory(open ? null : c.folder.id)}
                        >
                          <span className="tvp-callout-icon tvp-bg-teal">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span className="tvp-folder-name">
                              {c.folder.folderName}
                              {c.folder.restricted && <Lock className="inline h-3 w-3 ml-1" />}
                            </span>
                            <span className="tvp-folder-meta" style={{ display: "block" }}>
                              {c.count} {c.count === 1 ? "document" : "documents"}
                              {c.children.length > 0 &&
                                ` · ${c.children.length} ${c.children.length === 1 ? "subfolder" : "subfolders"}`}
                            </span>
                            {(c.reviewCount > 0 || c.expiringCount > 0 || c.needsReview) && (
                              <span className="tvp-folder-flags">
                                {c.reviewCount > 0 && (
                                  <span className="tvp-status tvp-purple">
                                    {c.reviewCount} to review
                                  </span>
                                )}
                                {c.expiringCount > 0 && (
                                  <span className="tvp-status tvp-amber">
                                    {c.expiringCount} expiring
                                  </span>
                                )}
                                {c.needsReview && (
                                  <span className="tvp-status tvp-amber">Folder needs review</span>
                                )}
                              </span>
                            )}
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
                                onClick={() =>
                                  setFolderSel({
                                    label: c.folder.folderName,
                                    names: c.names,
                                    restricted: c.folder.restricted,
                                  })
                                }
                              >
                                <FolderOpen className="h-4 w-4" />
                                Open all in this category
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
                                        onClick={() =>
                                          setFolderSel({
                                            label: `${c.folder.folderName} · ${s.folderName}`,
                                            names: [s.folderName],
                                            restricted: s.restricted,
                                          })
                                        }
                                      >
                                        {s.restricted && <Lock className="h-3 w-3" />}
                                        {s.folderName}
                                        <span
                                          className="tvp-muted"
                                          style={{ fontSize: 11, marginLeft: 4 }}
                                        >
                                          {n}
                                        </span>
                                        {s.needsReview && (
                                          <span
                                            className="tvp-status tvp-amber"
                                            style={{ marginLeft: 4 }}
                                          >
                                            Review
                                          </span>
                                        )}
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
                    <FilterBar
                      onChange={(k, v) =>
                        k === "folder" ? setFolderFilter(v) : setTalentFilter(v)
                      }
                      filters={[
                        {
                          key: "folder",
                          label: "Folder",
                          value: folderFilter,
                          options: [
                            { value: "all", label: "All folders" },
                            ...folderOptions.map((x: string) => ({ value: x, label: x })),
                          ],
                        },
                        {
                          key: "talent",
                          label: "Talent",
                          value: talentFilter,
                          options: [
                            { value: "all", label: "All talent" },
                            ...talentLinks.map((l) => ({ value: l.id, label: l.displayName })),
                          ],
                        },
                      ]}
                    />
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
                      const isLocked =
                        !!d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now();
                      const lockDate = d.lockedUntil ? fmtLongDate(d.lockedUntil) : "";
                      const docFacts = {
                        originator: d.originator ?? "agency",
                        talentName: d.talentName,
                        lockedUntil: d.lockedUntil,
                        linkStatus: d.linkStatus ?? null,
                        agencyReadOnly: readOnly,
                      };
                      const deleteBlock = agencyDocumentDeleteBlock(docFacts);
                      const changeBlock = agencyDocumentChangeBlock(docFacts, "changed");
                      return (
                        <tr key={d.id}>
                          <td>
                            <FileText className="inline h-4 w-4 mr-2 text-[var(--tvp-muted)]" />
                            {d.folder === "Contracts & Agreements" ? (
                              <Link
                                to="/agency/contracts/$id"
                                params={{ id: d.id }}
                                className="tvp-link"
                              >
                                <strong>{d.name}</strong>
                              </Link>
                            ) : d.quarantineReason ? (
                              <button
                                type="button"
                                className="tvp-link"
                                onClick={() => explainBlocked(d.quarantineReason!)}
                              >
                                <strong>{d.name}</strong>
                              </button>
                            ) : (
                              <strong>{d.name}</strong>
                            )}
                            {isLocked && (
                              <span
                                title={`Under a retention period until ${lockDate}, so it can't be deleted.`}
                                style={{
                                  marginLeft: 6,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: "var(--tvp-amber, #b45309)",
                                  fontSize: 12,
                                }}
                              >
                                <Lock className="h-3.5 w-3.5" />
                                Locked · {lockDate}
                              </span>
                            )}
                          </td>
                          <td>{d.talentName}</td>
                          <td>{d.folder}</td>
                          <td>
                            <span className={`tvp-status tvp-${statusTone(d.status)}`}>
                              {statusLabel(d.status)}
                            </span>
                            {d.pendingReview && (
                              <span
                                className={`${statusPillClass("document", "pending_review")} tvp-pending-pill`}
                              >
                                {lifecycleLabel("document", "pending_review")}
                              </span>
                            )}
                            <BlockedDocumentPill reason={d.quarantineReason} />
                          </td>
                          <td className="tvp-muted">{formatValidity(d.validityExpiresAt)}</td>
                          <td>
                            <div className="tvp-row-actions">
                              <RowActionsMenu
                                actions={[
                                  {
                                    key: "view",
                                    label: "View document",
                                    icon: Eye,
                                    disabled: !d.storagePath || viewMut.isPending,
                                    disabledReason: blockedReason(d.quarantineReason),
                                    title: d.storagePath
                                      ? undefined
                                      : "No file attached to this document",
                                    onSelect: () => viewMut.mutate(d.id),
                                  },
                                  {
                                    key: "download",
                                    label: "Download document",
                                    icon: Download,
                                    disabled: !d.storagePath || downloadMut.isPending,
                                    disabledReason: blockedReason(d.quarantineReason),
                                    onSelect: () => downloadMut.mutate(d.id),
                                  },
                                  !readOnly &&
                                    !d.quarantineReason &&
                                    d.pendingReview && {
                                      key: "review",
                                      label: "Finish filing review",
                                      icon: Sparkles,
                                      onSelect: () => setAiReviewFor({ id: d.id, name: d.name }),
                                    },
                                  !readOnly &&
                                    aiRow.canAnalyse(d.pendingReview) && {
                                      key: "analyse",
                                      label: "Analyse with AI",
                                      icon: Sparkles,
                                      disabled: !d.storagePath || aiRow.isPending,
                                      disabledReason: blockedReason(d.quarantineReason),
                                      onSelect: () =>
                                        aiRow.analyse({
                                          id: d.id,
                                          name: d.name,
                                          open: () => setAiReviewFor({ id: d.id, name: d.name }),
                                        }),
                                    },
                                  {
                                    key: "versions",
                                    label: "Version history",
                                    icon: History,
                                    separatorBefore: true,
                                    onSelect: () => {
                                      setVersionsCanUpload(!readOnly && !changeBlock);
                                      setVersionsFor(d);
                                    },
                                  },
                                  !readOnly && {
                                    key: "newversion",
                                    label: "Upload new version",
                                    icon: Upload,
                                    disabledReason: changeBlock ? blockText(changeBlock) : null,
                                    onSelect: () => setNewVersionFor(d),
                                  },
                                  !readOnly &&
                                    d.originator !== "talent" && {
                                      key: "stopsharing",
                                      label: "Stop sharing",
                                      icon: X,
                                      onSelect: async () => {
                                        const ok = await confirm({
                                          title: `Stop sharing "${d.name}"?`,
                                          body: `${stopSharingConfirmText(d.talentName)} It will no longer appear as newly shared or updated.`,
                                          confirmLabel: "Stop sharing",
                                        });
                                        if (!ok) return;
                                        try {
                                          await stopSharingFn({ data: { id: d.id } });
                                          toast.success("Sharing stopped");
                                        } catch (e) {
                                          toast.error(
                                            friendlyError(e, "Sharing couldn't be stopped."),
                                          );
                                        }
                                      },
                                    },
                                  !readOnly && {
                                    key: "delete",
                                    label: "Delete document",
                                    icon: Trash2,
                                    destructive: true,
                                    separatorBefore: true,
                                    disabled: deleteMut.isPending,
                                    disabledReason: deleteBlock ? blockText(deleteBlock) : null,
                                    onSelect: async () => {
                                      const ok = await confirm({
                                        title: `Delete "${d.name}"?`,
                                        body: "It moves to Recently deleted, where the agency owner can restore it until the recovery period ends. Anything already shared with the talent stays available to them.",
                                        confirmLabel: "Delete document",
                                        destructive: true,
                                      });
                                      if (ok) deleteMut.mutate(d.id);
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

      {!readOnly && showUpload && (
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

      {!readOnly && aiReviewFor && (
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

      {preview && (
        <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}

      {versionsFor && (
        <VersionsDialog
          doc={versionsFor}
          onClose={() => setVersionsFor(null)}
          onNewVersion={
            versionsCanUpload
              ? () => {
                  const d = versionsFor;
                  setVersionsFor(null);
                  setNewVersionFor(d);
                }
              : undefined
          }
        />
      )}

      {!readOnly && newVersionFor && (
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
    </>
  );
}

type PickerFolder = {
  id: string;
  folderName: string;
  parentFolderId: string | null;
  sortOrder: number;
};

/** Categories with their subfolders, filtered by the search term. */
function buildFolderTree(folders: PickerFolder[], search: string) {
  const parents = folders
    .filter((f) => !f.parentFolderId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.folderName.localeCompare(b.folderName));
  const childrenOf = (id: string) =>
    folders
      .filter((f) => f.parentFolderId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.folderName.localeCompare(b.folderName));
  const term = search.trim().toLowerCase();
  return parents
    .map((p) => {
      const kids = childrenOf(p.id);
      if (!term) return { parent: p, children: kids };
      const parentHit = p.folderName.toLowerCase().includes(term);
      const matchedKids = kids.filter((k) => k.folderName.toLowerCase().includes(term));
      if (parentHit) return { parent: p, children: kids };
      if (matchedKids.length) return { parent: p, children: matchedKids };
      return null;
    })
    .filter((x): x is { parent: PickerFolder; children: PickerFolder[] } => x !== null);
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
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_BYTES = 20 * 1024 * 1024;
  const ALLOWED = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/heic",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ];

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [talentLinkId, setTalentLinkId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [folderSearch, setFolderSearch] = useState("");
  const [suggestedFolderId, setSuggestedFolderId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [status, setStatus] = useState<"filed" | "needs_review">("needs_review");
  const [expiry, setExpiry] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const prefFn = useServerFn(getAiFilingPreference);
  const { data: aiPref } = useQuery({
    queryKey: ["ai-filing-preference"],
    queryFn: () => prefFn() as Promise<{ aiEnabled: boolean }>,
    staleTime: 60_000,
  });
  const aiEnabled = aiPref?.aiEnabled === true;

  const listFoldersFn = useServerFn(listAgencyTalentFolders);
  const { data: allowedFolders, isLoading: foldersLoading } = useQuery({
    queryKey: ["agency", "vault", "talent-folders", talentLinkId],
    queryFn: () => listFoldersFn({ data: { talent_link_id: talentLinkId } }),
    enabled: !!talentLinkId,
  });

  const folders = (allowedFolders ?? []) as PickerFolder[];
  const tree = buildFolderTree(folders, folderSearch);
  const selectedFolder = folders.find((f) => f.id === folderId) ?? null;
  const selectedTalent = talentLinks.find((l) => l.id === talentLinkId) ?? null;

  function folderPath(f: PickerFolder): string {
    const parent = folders.find((p) => p.id === f.parentFolderId);
    return parent ? `${parent.folderName} › ${f.folderName}` : f.folderName;
  }

  // Reset folder selection when talent changes
  const folderKeys = folders.map((f) => f.id).join("|");
  useMemo(() => {
    if (folderId && !folders.some((f) => f.id === folderId)) setFolderId("");
    if (suggestedFolderId && !folders.some((f) => f.id === suggestedFolderId))
      setSuggestedFolderId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKeys]);

  function pickFile(f: File | null) {
    setFileError(null);
    if (f) {
      if (f.size > MAX_BYTES) {
        setFile(null);
        setFileError(`"${f.name}" is ${humanSize(f.size)} — the limit is 20 MB.`);
        return;
      }
      if (f.type && !ALLOWED.includes(f.type)) {
        setFile(null);
        setFileError(`"${f.name}" isn't a supported file type. Use a PDF, image or document.`);
        return;
      }
      if (!displayName) setDisplayName(f.name.replace(/\.[^.]+$/, ""));
      // Filename-based folder suggestion, only when the agency has opted in.
      if (aiEnabled && folders.length) {
        const catalog = folders.map((x) => ({ id: x.id, label: folderPath(x) }));
        const hit = suggestFromFileName(f.name, catalog);
        if (hit?.folder_id) {
          setSuggestedFolderId(hit.folder_id);
          setFolderId(hit.folder_id);
        } else {
          setSuggestedFolderId(null);
        }
      }
    }
    setFile(f);
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
    if (!selectedFolder) return toast.error("Choose a folder for this document");

    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${agencyId}/${talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("talent-documents").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;

      const ext = file.name.match(/\.[^.]+$/)?.[0] ?? "";
      const finalName = displayName.trim()
        ? displayName.trim().endsWith(ext)
          ? displayName.trim()
          : displayName.trim() + ext
        : file.name;

      const inserted = await registerFn({
        data: {
          name: finalName,
          folder: selectedFolder.folderName,
          storage_path: path,
          talent_link_id: talentLinkId || null,
          status,
          validity_expires_at: expiry ? new Date(expiry).toISOString() : null,
          mime_type: file.type || null,
        },
      });

      toast.success("Uploaded and shared");
      onDone(inserted?.id ? { id: inserted.id as string, name: finalName } : undefined);
    } catch (err: unknown) {
      toast.error(friendlyError(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="tvp-card"
        style={{
          width: "min(680px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2 className="tvp-h2" style={{ margin: 0 }}>
            Upload document
          </h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            {selectedTalent
              ? `This document will be shared with ${selectedTalent.displayName}.`
              : "Choose a talent, add the file, then pick the folder it belongs in."}
          </p>
        </div>

        {/* Talent */}
        <div>
          <label className="tvp-form-label" htmlFor="upload-talent">
            Talent
          </label>
          <select
            id="upload-talent"
            className="tvp-select"
            value={talentLinkId}
            onChange={(e) => {
              setTalentLinkId(e.target.value);
              setFolderId("");
              setSuggestedFolderId(null);
              setFolderSearch("");
            }}
          >
            <option value="">Select talent…</option>
            {talentLinks.map((l) => (
              <option key={l.id} value={l.id} disabled={l.status === "ended"}>
                {l.displayName}
                {l.status === "ended" ? " (ended — new uploads blocked)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* File */}
        <div>
          <label className="tvp-form-label" id="upload-file-label">
            File
          </label>
          <div
            aria-labelledby="upload-file-label"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) pickFile(f);
            }}
            role="button"
            tabIndex={0}
            style={{
              border: `1.5px dashed ${dragOver ? "var(--tvp-teal-2)" : "var(--tvp-line)"}`,
              background: dragOver ? "var(--surface-soft)" : "transparent",
              borderRadius: 10,
              padding: file ? "12px 14px" : "22px 14px",
              cursor: "pointer",
              transition: "all 120ms ease",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {file ? (
              <>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "var(--surface-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--tvp-teal-2)",
                    flexShrink: 0,
                  }}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12 }}>
                    {humanSize(file.size)} · click to replace
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    pickFile(null);
                    setSuggestedFolderId(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
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
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--surface-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--tvp-teal-2)",
                    flexShrink: 0,
                  }}
                >
                  <Upload className="h-5 w-5" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Drop a file here, or <span style={{ color: "var(--tvp-teal-2)" }}>browse</span>
                  </div>
                  <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    PDF, image or document, up to 20 MB
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
          {fileError && (
            <p className="tvp-field-error" role="alert" style={{ marginTop: 6 }}>
              {fileError}
            </p>
          )}
        </div>

        {/* Folder */}
        <div>
          <label className="tvp-form-label" id="upload-folder-label">
            Folder
          </label>
          {!talentLinkId ? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              Select a talent first — their shared folders will appear here.
            </p>
          ) : foldersLoading ? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading folders…
            </p>
          ) : folders.length === 0 ? (
            <p className="tvp-muted" style={{ fontSize: 13 }}>
              This talent has no shared folders yet. Set them up under{" "}
              <Link to="/agency/settings" search={{ tab: "folders" }} className="tvp-link">
                Manage folders
              </Link>
              .
            </p>
          ) : (
            <>
              {suggestedFolderId && selectedFolder?.id === suggestedFolderId && (
                <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  Suggested folder: <strong>{folderPath(selectedFolder)}</strong> · Based on the
                  file name{" "}
                  <button
                    type="button"
                    className="tvp-link"
                    style={{ fontSize: 13 }}
                    onClick={() => {
                      setSuggestedFolderId(null);
                      setFolderId("");
                    }}
                  >
                    Change
                  </button>
                </p>
              )}
              <div
                style={{
                  border: "1px solid var(--tvp-line)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--tvp-line)",
                  }}
                >
                  <Search className="h-4 w-4" style={{ color: "var(--tvp-muted)" }} />
                  <input
                    type="search"
                    aria-label="Search folders"
                    placeholder="Search folders"
                    value={folderSearch}
                    onChange={(e) => setFolderSearch(e.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "var(--tvp-ink)",
                      fontSize: 13,
                      width: "100%",
                    }}
                  />
                </div>
                <div style={{ maxHeight: 240, overflow: "auto", padding: 6 }}>
                  {tree.length === 0 ? (
                    <p className="tvp-muted" style={{ fontSize: 13, padding: "8px 6px" }}>
                      No folders match “{folderSearch}”.
                    </p>
                  ) : (
                    tree.map(({ parent, children }) => (
                      <div key={parent.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFolderId(parent.id);
                            setSuggestedFolderId(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "none",
                            textAlign: "left",
                            fontWeight: 600,
                            fontSize: 13,
                            background:
                              folderId === parent.id ? "var(--surface-soft)" : "transparent",
                            color: "var(--tvp-ink)",
                            cursor: "pointer",
                          }}
                        >
                          <FolderOpen
                            className="h-4 w-4"
                            style={{
                              color:
                                folderId === parent.id ? "var(--tvp-teal-2)" : "var(--tvp-muted)",
                            }}
                          />
                          {parent.folderName}
                        </button>
                        {children.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFolderId(c.id);
                              setSuggestedFolderId(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "7px 10px 7px 32px",
                              borderRadius: 8,
                              border: "none",
                              textAlign: "left",
                              fontSize: 13,
                              background: folderId === c.id ? "var(--surface-soft)" : "transparent",
                              color: "var(--tvp-ink)",
                              cursor: "pointer",
                            }}
                          >
                            {c.folderName}
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Optional name override */}
        <div>
          <label className="tvp-form-label" htmlFor="upload-name">
            Document name{" "}
            <span style={{ fontWeight: 400, color: "var(--tvp-muted)" }}>(optional)</span>
          </label>
          <input
            id="upload-name"
            className="tvp-select"
            type="text"
            placeholder={file?.name ?? "Defaults to file name"}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {/* Status + Expiry side by side */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label className="tvp-form-label" htmlFor="upload-status">
              Status
            </label>
            <select
              id="upload-status"
              className="tvp-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as "filed" | "needs_review")}
            >
              <option value="needs_review">Needs review</option>
              <option value="filed">Filed</option>
            </select>
          </div>
          <div>
            <label className="tvp-form-label" htmlFor="upload-expiry">
              Expiry <span style={{ fontWeight: 400, color: "var(--tvp-muted)" }}>(optional)</span>
            </label>
            <input
              id="upload-expiry"
              className="tvp-select"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="tvp-primary"
            disabled={busy || !file || !talentLinkId || !folderId}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload and share
          </button>
        </div>
      </form>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Version history dialog
// ---------------------------------------------------------------------------
function VersionsDialog({
  doc,
  onClose,
  onNewVersion,
}: {
  doc: VaultDoc;
  onClose: () => void;
  onNewVersion?: () => void;
}) {
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
    } catch (e) {
      toast.error(friendlyError(e, "Could not open version"));
    }
  }

  const versions = data?.versions ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
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
            <div className="tvp-muted" style={{ fontSize: 13 }}>
              {doc.name}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {onNewVersion && (
              <button className="tvp-secondary" onClick={onNewVersion}>
                <Upload className="h-4 w-4" /> Upload new version
              </button>
            )}
            <button className="tvp-mini-btn" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="tvp-muted" style={{ padding: 24, textAlign: "center" }}>
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading…
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
                <th>Uploaded by</th>
                <th>Uploaded</th>
                <th>Protected until</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>v{v.version_number}</strong>
                    {data?.currentVersionId === v.id ? " · current" : ""}
                  </td>
                  <td>
                    {v.name}
                    <BlockedDocumentPill reason={quarantineReason(v)} />
                  </td>
                  <td>{v.uploaded_by_name ?? "—"}</td>
                  <td className="tvp-muted">{new Date(v.created_at).toLocaleString("en-GB")}</td>
                  <td className="tvp-muted">
                    {v.locked_until ? fmtLongDate(v.locked_until) : "No rule"}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button
                        className="tvp-mini-btn"
                        title={blockedReason(quarantineReason(v)) ?? "View"}
                        aria-disabled={Boolean(quarantineReason(v))}
                        onClick={() => {
                          const r = quarantineReason(v);
                          if (r) return explainBlocked(r);
                          open(v.id, "inline");
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="tvp-mini-btn"
                        title={blockedReason(quarantineReason(v)) ?? "Download"}
                        aria-disabled={Boolean(quarantineReason(v))}
                        onClick={() => {
                          const r = quarantineReason(v);
                          if (r) return explainBlocked(r);
                          open(v.id, "attachment");
                        }}
                      >
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
      {preview && (
        <PreviewDialog url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New version upload dialog
// ---------------------------------------------------------------------------
function NewVersionDialog({
  doc,
  agencyId,
  onClose,
  onDone,
}: {
  doc: VaultDoc;
  agencyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
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
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${agencyId}/${doc.talentLinkId || "unassigned"}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("talent-documents").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
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
    } catch (err: unknown) {
      toast.error(friendlyError(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
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
        <label className="tvp-muted" style={{ fontSize: 13 }}>
          File
        </label>
        <input ref={fileRef} type="file" required />
        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
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
// ---------------------------------------------------------------------------
