import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Suspense } from "react";
import { AgencyProfilePanel } from "@/components/agency/agency-profile-panel";
import {
  FolderTemplatesPanel,
  folderTemplatesListQO,
  folderTemplatesMeQO,
} from "@/components/agency/folder-templates-panel";
import {
  DocumentRulesPanel,
  documentRulesQO,
  documentRulesDocsQO,
  documentRulesMeQO,
} from "@/components/agency/document-rules-panel";
import { QuotesInvoicesSettingsPanel } from "@/components/agency/quotes-invoices-settings-panel";

const tabSchema = z.enum(["profile", "folders", "document-rules", "quotes-invoices"]).catch("profile");

const searchSchema = z.object({
  tab: tabSchema.optional(),
});

export const Route = createFileRoute("/agency/settings")({
  head: () => ({ meta: [{ title: "Agency Profile · TalVault" }] }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "profile" }),
  loader: async ({ context, deps }) => {
    const tab = deps.tab;
    if (tab === "folders") {
      await Promise.all([
        context.queryClient.ensureQueryData(folderTemplatesListQO),
        context.queryClient.ensureQueryData(folderTemplatesMeQO),
      ]);
    } else if (tab === "document-rules") {
      await Promise.all([
        context.queryClient.ensureQueryData(documentRulesQO),
        context.queryClient.ensureQueryData(documentRulesDocsQO),
        context.queryClient.ensureQueryData(documentRulesMeQO),
      ]);
    }
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Agency Profile</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: AgencySettingsPage,
});

const TABS: { key: "profile" | "folders" | "document-rules" | "quotes-invoices"; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "folders", label: "Manage Folders" },
  { key: "document-rules", label: "Document Rules" },
  { key: "quotes-invoices", label: "Quotes & Invoices" },
];

function AgencySettingsPage() {
  const { tab: tabParam } = Route.useSearch();
  const tab = tabParam ?? "profile";

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Agency Profile</h1>
          <div className="tvp-subtitle">Profile, folders, retention rules, and billing defaults.</div>
        </div>
      </div>

      <div className="tvp-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/agency/settings"
            search={{ tab: t.key }}
            className={`tvp-tab${tab === t.key ? " tvp-active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Suspense fallback={<div className="tvp-muted" style={{ padding: 24 }}>Loading…</div>}>
        {tab === "profile" && <AgencyProfilePanel />}
        {tab === "folders" && <FolderTemplatesPanel />}
        {tab === "document-rules" && <DocumentRulesPanel />}
        {tab === "quotes-invoices" && <QuotesInvoicesSettingsPanel />}
      </Suspense>
    </>
  );
}
