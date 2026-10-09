import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Download, Eye, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  getAcceptedTermsText,
  listTermsAcceptances,
  listTermsNotAccepted,
  type AdminAcceptanceRow,
} from "@/lib/terms-acceptance.functions";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import { ModalShell } from "@/components/shared/modal-shell";
import { LegalDocumentView } from "@/components/shared/legal-document-view";
import { deviceLabel } from "@/lib/device";

export const Route = createFileRoute("/admin/terms-acceptances")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Terms acceptances · TalVault Admin" },
      { name: "description", content: "Who accepted which Terms & Conditions, with proof of the exact text." },
      { property: "og:title", content: "Terms acceptances · TalVault Admin" },
      { property: "og:description", content: "Who accepted which Terms & Conditions, with proof of the exact text." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TermsAcceptancesPage,
});

const ROLE_LABEL: Record<string, string> = {
  talent: "Talent",
  agency_owner: "Agency owner",
  agency_staff: "Agency staff",
};
const METHOD_LABEL: Record<string, string> = {
  activation: "Account activation",
  reacceptance: "Re-acceptance at sign-in",
};
const typeLabel = (t: string) => (t === "talent" ? "Talent" : "Agency");
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TermsAcceptancesPage() {
  const listFn = useServerFn(listTermsAcceptances);
  const missingFn = useServerFn(listTermsNotAccepted);
  const [view, setView] = useState<"accepted" | "missing">("accepted");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [version, setVersion] = useState("all");
  const [role, setRole] = useState("all");
  const [agency, setAgency] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AdminAcceptanceRow | null>(null);

  const list = useQuery({ queryKey: ["admin", "terms-acceptances"], queryFn: () => listFn() });
  const missing = useQuery({ queryKey: ["admin", "terms-not-accepted"], queryFn: () => missingFn() });

  const rows = list.data?.rows ?? [];
  const versions = [...new Set((list.data?.versions ?? []).map((v) => v.version))];
  const agencies = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.agency_id) m.set(r.agency_id, r.agency_name ?? "Unknown agency");
    for (const r of missing.data ?? []) if (r.agency_id) m.set(r.agency_id, r.agency_name ?? "Unknown agency");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, missing.data]);

  const q = search.trim().toLowerCase();
  const matchesCommon = (r: { name: string | null; email: string | null; role: string | null; agency_id: string | null }, docType: string) =>
    (type === "all" || docType === type) &&
    (role === "all" || r.role === role) &&
    (agency === "all" || r.agency_id === agency) &&
    (!q || (r.name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));

  const filtered = rows.filter((r) => {
    if (!matchesCommon(r, r.doc_type)) return false;
    if (version !== "all" && r.version !== version) return false;
    const d = r.accepted_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const filteredMissing = (missing.data ?? []).filter((r) => matchesCommon(r, r.doc_type));
  const filtersActive = !!(q || type !== "all" || version !== "all" || role !== "all" || agency !== "all" || from || to);

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (view === "accepted") {
      downloadCsv(
        `terms-acceptances-${stamp}.csv`,
        ["Proof reference", "Name", "Email", "Role", "Agency", "Terms type", "Version", "Accepted at (UTC)", "IP address", "Device", "User agent", "How accepted", "Text SHA-256", "Text verified", "Hash added retrospectively"],
        filtered.map((r) => [
          r.proof_ref, r.name, r.email, r.role ? ROLE_LABEL[r.role] : "", r.agency_name, typeLabel(r.doc_type), r.version,
          r.accepted_at, r.ip_address, r.user_agent ? deviceLabel(r.user_agent) : "", r.user_agent,
          r.acceptance_method ? METHOD_LABEL[r.acceptance_method] : "Not recorded", r.body_sha256,
          r.text_verified ? "Yes" : "No", r.hash_retrospective ? "Yes" : "No",
        ]),
      );
    } else {
      downloadCsv(
        `terms-not-accepted-${stamp}.csv`,
        ["Name", "Email", "Role", "Agency", "Terms type", "Current version", "Last version accepted"],
        filteredMissing.map((r) => [r.name, r.email, ROLE_LABEL[r.role], r.agency_name, typeLabel(r.doc_type), r.current_version, r.last_accepted_version ?? "None"]),
      );
    }
  }

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Terms acceptances</h1>
          <div className="tvp-subtitle">
            Every Terms & Conditions acceptance, with proof of the exact text accepted. Records cannot be changed or deleted.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-secondary" onClick={exportCsv} data-tour="admin-terms-export">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="tvp-tabs" data-tour="admin-terms-views">
        <button className={`tvp-tab ${view === "accepted" ? "tvp-active" : ""}`} onClick={() => setView("accepted")}>
          Acceptances <span className="tvp-muted">{rows.length}</span>
        </button>
        <button className={`tvp-tab ${view === "missing" ? "tvp-active" : ""}`} onClick={() => setView("missing")}>
          Not yet accepted current version <span className="tvp-muted">{missing.data?.length ?? 0}</span>
        </button>
      </div>

      <div className="tvp-card">
        <div className="tvp-toolbar" data-tour="admin-terms-filters" style={{ flexWrap: "wrap", gap: 8 }}>
          <input className="tvp-search" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Terms type" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 150 }}>
            <option value="all">All types</option>
            <option value="talent">Talent</option>
            <option value="agency">Agency</option>
          </select>
          {view === "accepted" && (
            <select aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value)} style={{ maxWidth: 140 }}>
              <option value="all">All versions</option>
              {versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Agency" value={agency} onChange={(e) => setAgency(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">All agencies</option>
            {agencies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          {view === "accepted" && (
            <>
              <input type="date" aria-label="Accepted from" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" aria-label="Accepted to" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          {filtersActive && (
            <button className="tvp-link" onClick={() => { setSearch(""); setType("all"); setVersion("all"); setRole("all"); setAgency("all"); setFrom(""); setTo(""); }}>
              Reset filters
            </button>
          )}
        </div>

        <div className="tvp-table-wrap">
          {view === "accepted" ? (
            <table className="tvp-table" data-tour="admin-terms-table">
              <thead>
                <tr>
                  <th>Name</th><th>Role</th><th>Agency</th><th>Terms</th><th>Accepted</th><th>IP</th><th>Device</th><th>Proof reference</th><th>Text verified</th><th></th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading && <tr><td colSpan={10} className="tvp-muted">Loading…</td></tr>}
                {list.error && <tr><td colSpan={10} className="tvp-muted">{(list.error as Error).message}</td></tr>}
                {!list.isLoading && filtered.length === 0 && <tr><td colSpan={10} className="tvp-muted">No acceptances match.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name ?? "—"}</strong><br />
                      <span className="tvp-muted">{r.email ?? "—"}</span>
                    </td>
                    <td>{r.role ? ROLE_LABEL[r.role] : "—"}</td>
                    <td>{r.agency_name ?? "—"}</td>
                    <td>{typeLabel(r.doc_type)} · {r.version}</td>
                    <td>{fmt(r.accepted_at)}</td>
                    <td>{r.ip_address ?? "—"}</td>
                    <td>{r.user_agent ? deviceLabel(r.user_agent) : "—"}</td>
                    <td><code>{r.proof_ref ?? "—"}</code></td>
                    <td>
                      {r.text_verified ? (
                        <span className="tvp-status tvp-green" title={r.hash_retrospective ? "Hash added retrospectively" : "Hash matches the document"}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> {r.hash_retrospective ? "Verified (retrospective)" : "Verified"}
                        </span>
                      ) : (
                        <span className="tvp-status tvp-red">Mismatch</span>
                      )}
                    </td>
                    <td>
                      <RowActionsMenu
                        actions={[
                          { key: "view", label: "View details and text", icon: Eye, onSelect: () => setDetail(r) },
                          {
                            key: "copy",
                            label: "Copy proof reference",
                            icon: Copy,
                            hidden: !r.proof_ref,
                            onSelect: () => navigator.clipboard.writeText(r.proof_ref ?? "").then(() => toast.success("Proof reference copied")),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="tvp-table" data-tour="admin-terms-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Agency</th><th>Terms</th><th>Last version accepted</th></tr>
              </thead>
              <tbody>
                {missing.isLoading && <tr><td colSpan={5} className="tvp-muted">Loading…</td></tr>}
                {!missing.isLoading && filteredMissing.length === 0 && (
                  <tr><td colSpan={5} className="tvp-muted">Everyone matching these filters has accepted the current version.</td></tr>
                )}
                {filteredMissing.map((r) => (
                  <tr key={`${r.user_id}-${r.doc_type}`}>
                    <td><strong>{r.name ?? "—"}</strong><br /><span className="tvp-muted">{r.email ?? "—"}</span></td>
                    <td>{ROLE_LABEL[r.role]}</td>
                    <td>{r.agency_name ?? "—"}</td>
                    <td>{typeLabel(r.doc_type)} · {r.current_version}</td>
                    <td>{r.last_accepted_version ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detail && <AcceptanceDetail row={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function AcceptanceDetail({ row, onClose }: { row: AdminAcceptanceRow; onClose: () => void }) {
  const textFn = useServerFn(getAcceptedTermsText);
  const text = useQuery({ queryKey: ["admin", "terms-text", row.id], queryFn: () => textFn({ data: { acceptance_id: row.id } }) });
  const fields: [string, React.ReactNode][] = [
    ["Proof reference", <code key="p">{row.proof_ref ?? "—"}</code>],
    ["Name", row.name ?? "—"],
    ["Email", row.email ?? "—"],
    ["Role", row.role ? ROLE_LABEL[row.role] : "—"],
    ["Agency", row.agency_name ?? "—"],
    ["Identity source", row.stamped_identity ? "Recorded at acceptance" : "Not recorded at acceptance — shows the current profile"],
    ["Terms", `${typeLabel(row.doc_type)} · version ${row.version}`],
    ["Accepted at", `${fmt(row.accepted_at)} (${row.accepted_at})`],
    ["How accepted", row.acceptance_method ? METHOD_LABEL[row.acceptance_method] : "Not recorded"],
    ["IP address", row.ip_address ?? "—"],
    ["Device", row.user_agent ? deviceLabel(row.user_agent) : "—"],
    ["User agent", row.user_agent ?? "—"],
    ["Text SHA-256 (accepted)", <code key="h" style={{ wordBreak: "break-all" }}>{row.body_sha256 ?? "—"}</code>],
    ["Text SHA-256 (document)", <code key="d" style={{ wordBreak: "break-all" }}>{row.document_sha256 ?? "—"}</code>],
    ["Text verified", row.text_verified ? "Yes — the hashes match" : "No — the hashes differ"],
    ["Hash added retrospectively", row.hash_retrospective ? "Yes — added on 9 October 2026; the text before that date cannot be proven" : "No"],
  ];
  return (
    <ModalShell onClose={onClose} maxWidth={820} labelledBy="terms-detail-title">
      <div style={{ padding: 24 }}>
        <h2 id="terms-detail-title" className="tvp-h2" style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
          <FileText className="h-5 w-5" /> Acceptance record
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "6px 12px", marginTop: 14, fontSize: 13 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="tvp-muted">{k}</dt>
              <dd style={{ margin: 0 }}>{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="tvp-h3" style={{ marginTop: 18 }}>
          {text.data ? `Text accepted — ${text.data.title} · version ${text.data.version}` : "Text accepted"}
        </h3>
        {text.isLoading && <p className="tvp-muted">Loading…</p>}
        {text.data && <LegalDocumentView body={text.data.body} maxHeight={360} />}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="tvp-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalShell>
  );
}
