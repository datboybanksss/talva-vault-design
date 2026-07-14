import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Plus, Trash2, Pencil, Info, FileText, Folder } from "lucide-react";
import { toast } from "sonner";
import {
  listAgencyRetentionRules,
  upsertAgencyRetentionRule,
  deleteAgencyRetentionRule,
  listAgencyVaultDocuments,
  agencyWhoami,
} from "@/lib/agency.functions";

type Rule = {
  id: string;
  scope: "folder" | "document";
  scopeValue: string | null;
  documentId: string | null;
  retentionYears: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  documentLabel: string | null;
  documentFolder: string | null;
};

const FOLDER_OPTIONS = ["Contracts", "ID Documents", "Travel", "Tax", "Certified Documents", "Proof of Accounts", "Property", "Sponsorships", "Other"];

const rulesQO = queryOptions({
  queryKey: ["agency", "retention", "rules"],
  queryFn: () => listAgencyRetentionRules() as Promise<Rule[]>,
});
const docsQO = queryOptions({
  queryKey: ["agency", "vault", "docs"],
  queryFn: () => listAgencyVaultDocuments() as Promise<any[]>,
});
const meQO = queryOptions({
  queryKey: ["agency", "whoami"],
  queryFn: () => agencyWhoami(),
});

export const Route = createFileRoute("/agency/document-rules")({
  head: () => ({ meta: [{ title: "Document Rules · TalVault Agency" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rulesQO),
      context.queryClient.ensureQueryData(docsQO),
      context.queryClient.ensureQueryData(meQO),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="tvp-card" style={{ padding: 24 }}>
      <h1 className="tvp-h1">Document Rules</h1>
      <p className="tvp-muted">Failed to load: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div>Not found</div>,
  component: DocumentRulesPage,
});

function DocumentRulesPage() {
  const qc = useQueryClient();
  const { data: rules } = useSuspenseQuery(rulesQO);
  const { data: docs } = useSuspenseQuery(docsQO);
  const { data: me } = useSuspenseQuery(meQO);
  const isOwner = me?.role === "owner";

  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  const upsertFn = useServerFn(upsertAgencyRetentionRule);
  const deleteFn = useServerFn(deleteAgencyRetentionRule);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["agency", "retention"] });
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const folderRules = rules.filter((r) => r.scope === "folder");
  const docRules = rules.filter((r) => r.scope === "document");

  const now = Date.now();
  const locked = docs.filter((d: any) => d.lockedUntil && new Date(d.lockedUntil).getTime() > now);
  const unlockingSoon = locked.filter(
    (d: any) => new Date(d.lockedUntil).getTime() - now < 90 * 86400000,
  );

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Document Rules</h1>
          <div className="tvp-subtitle">
            Retention rules lock documents from deletion for compliance windows.
          </div>
        </div>
        <div className="tvp-actions">
          <button
            className="tvp-primary"
            disabled={!isOwner}
            title={isOwner ? "Add a folder retention rule" : "Only agency owners can manage retention rules"}
            onClick={() => setEditing({ scope: "folder", retentionYears: 5 })}
          >
            <Plus className="h-4 w-4" />Add folder rule
          </button>
        </div>
      </div>

      <div className="tvp-callout">
        <div className="tvp-callout-icon"><Info className="h-4 w-4" /></div>
        <div>
          <strong>How retention works.</strong> While a rule is active, matching documents cannot be
          deleted by anyone in the agency. After the retention period expires, delete works normally.
          Retention is measured from the document's upload date.
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{folderRules.length}</div>
            <div className="tvp-kpi-label">Folder rules</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{docRules.length}</div>
            <div className="tvp-kpi-label">Per-document overrides</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-amber"><Folder className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{locked.length}</div>
            <div className="tvp-kpi-label">Documents currently locked</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-blue"><Folder className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{unlockingSoon.length}</div>
            <div className="tvp-kpi-label">Unlocking in 90 days</div>
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Folder retention rules</h2>
        </div>
        {folderRules.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            No folder rules yet. Add one to lock every document in a folder for a fixed period.
          </p>
        ) : (
          <table className="tvp-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Folder</th>
                <th>Retention (years)</th>
                <th>Description</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {folderRules.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.scopeValue}</strong></td>
                  <td>{r.retentionYears}</td>
                  <td className="tvp-muted">{r.description ?? "—"}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="tvp-mini-btn" disabled={!isOwner} title="Edit" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="tvp-mini-btn"
                        disabled={!isOwner || deleteMut.isPending}
                        title="Delete"
                        onClick={() => confirm(`Delete rule for "${r.scopeValue}"?`) && deleteMut.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Per-document overrides</h2>
        </div>
        {docRules.length === 0 ? (
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            None. You can add an override from the Document Vault row menu, or below.
          </p>
        ) : (
          <table className="tvp-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Folder</th>
                <th>Retention (years)</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {docRules.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.documentLabel}</strong></td>
                  <td>{r.documentFolder ?? "—"}</td>
                  <td>{r.retentionYears}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button
                        className="tvp-mini-btn"
                        disabled={!isOwner || deleteMut.isPending}
                        title="Remove override"
                        onClick={() => confirm("Remove this per-document override?") && deleteMut.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && isOwner && (
        <RuleDialog
          initial={editing}
          docs={docs}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await upsertFn({ data: payload });
              toast.success("Rule saved");
              qc.invalidateQueries({ queryKey: ["agency", "retention"] });
              qc.invalidateQueries({ queryKey: ["agency", "vault"] });
              setEditing(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Save failed");
            }
          }}
        />
      )}
    </>
  );
}

function RuleDialog({
  initial,
  docs,
  onClose,
  onSave,
}: {
  initial: Partial<Rule>;
  docs: any[];
  onClose: () => void;
  onSave: (p: any) => Promise<void>;
}) {
  const [scope, setScope] = useState<"folder" | "document">(initial.scope ?? "folder");
  const [scopeValue, setScopeValue] = useState<string>(initial.scopeValue ?? FOLDER_OPTIONS[0]);
  const [documentId, setDocumentId] = useState<string>(initial.documentId ?? (docs[0]?.id ?? ""));
  const [years, setYears] = useState<number>(initial.retentionYears ?? 5);
  const [description, setDescription] = useState<string>(initial.description ?? "");
  const [busy, setBusy] = useState(false);

  const allFolders = useMemo(() => {
    const set = new Set(FOLDER_OPTIONS);
    for (const d of docs) if (d.folder) set.add(d.folder);
    return Array.from(set).sort();
  }, [docs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        id: initial.id,
        scope,
        scope_value: scope === "folder" ? scopeValue : null,
        document_id: scope === "document" ? documentId : null,
        retention_years: Number(years),
        description: description || null,
      });
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
        style={{ width: 520, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="tvp-h2">{initial.id ? "Edit retention rule" : "Add retention rule"}</h2>

        <label className="tvp-muted" style={{ fontSize: 13 }}>Scope</label>
        <select
          className="tvp-select"
          value={scope}
          onChange={(e) => setScope(e.target.value as "folder" | "document")}
          disabled={!!initial.id}
        >
          <option value="folder">Entire folder</option>
          <option value="document">Specific document</option>
        </select>

        {scope === "folder" ? (
          <>
            <label className="tvp-muted" style={{ fontSize: 13 }}>Folder</label>
            <select className="tvp-select" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
              {allFolders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </>
        ) : (
          <>
            <label className="tvp-muted" style={{ fontSize: 13 }}>Document</label>
            <select className="tvp-select" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              {docs.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name} — {d.talentName}</option>
              ))}
            </select>
          </>
        )}

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
          placeholder="e.g. Statutory 10-year contract retention"
        />

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="tvp-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tvp-primary" disabled={busy}>Save rule</button>
        </div>
      </form>
    </div>
  );
}
