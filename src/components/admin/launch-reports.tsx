import { useNavigate, useSearch } from "@tanstack/react-router";
import { FilterBar } from "@/components/shared/filter-bar";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Settings2 } from "lucide-react";
import {
  getLaunchReports,
  getLaunchSettings,
  updateLaunchSettings,
} from "@/lib/launch-reporting.functions";
import {
  FUNNEL_BUCKETS,
  LAUNCH_SETTING_KEYS,
  toCsv,
  type LaunchSettings,
} from "@/lib/launch-reporting-core";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { friendlyError } from "@/lib/friendly-error";
import { PAGE_SIZE } from "@/lib/pagination";
import { ACCOUNT_SCOPES, ACCOUNT_SCOPE_LABEL } from "@/lib/account-filters";
import { ModalShell } from "@/components/shared/modal-shell";

/** Date invitation send times and sources started being recorded. */
const RECORDING_SINCE = "22 Oct 2026";

const SETTING_LABEL: Record<keyof LaunchSettings, string> = {
  launch_date: "Launch date",
  window_months: "Target window (months)",
  talent_target: "Talent target",
  agency_target: "Agency target",
  offer_free_months: "Free period (months)",
  offer_talent_places: "Offer places · talent",
  offer_agency_places: "Offer places · agencies",
};
const SOURCE_LABEL: Record<string, string> = {
  admin: "Admin",
  agency: "Agency",
  waiting_list: "Waiting list",
  not_recorded: `Not recorded before ${RECORDING_SINCE}`,
};

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
      })
    : "—";

function download(name: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LaunchReports({ from, to }: { from: string; to: string }) {
  const search = useSearch({ from: "/admin/reporting" });
  const navigate = useNavigate({ from: "/admin/reporting" });
  const type = search.type ?? "all";
  const segment = search.talent ?? "all";
  const accounts = search.accounts ?? "real";
  const [viewing, setViewing] = useState<null | "talent" | "agencies" | "invitations">(null);
  const setFilter = (key: string, value: string) =>
    navigate({
      search: (prev) => {
        const dflt = key === "accounts" ? "real" : "all";
        const next = { ...prev, [key]: value === dflt ? undefined : value };
        if (key === "type" && value === "agency") next.talent = undefined;
        return next as typeof prev;
      },
      replace: true,
    });
  const [offerOffset, setOfferOffset] = useState(0);
  const [termsOffset, setTermsOffset] = useState(0);
  const [outstandingOffset, setOutstandingOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setOfferOffset(0);
    setTermsOffset(0);
    setOutstandingOffset(0);
  }, [type, segment, accounts, from, to]);

  const fn = useServerFn(getLaunchReports);
  const base = { from, to, type, segment: type === "agency" ? "all" : segment, accounts } as const;
  const q = useQuery({
    queryKey: ["admin", "launch-reports", base, offerOffset, termsOffset, outstandingOffset],
    queryFn: () =>
      fn({ data: { ...base, offerOffset, termsOffset, outstandingOffset, limit: PAGE_SIZE } }) as Promise<any>,
  });
  const d = q.data;

  async function exportCsv(kind: "funnel" | "offer" | "terms" | "outstanding") {
    try {
      const all: any = await fn({ data: { ...base, limit: 5000 } });
      const stamp = `${from}_${to}`;
      if (kind === "funnel") {
        const f = all.funnel;
        download(`invitation-conversion_${stamp}.csv`, [
          ["Status", "Count", ...Object.keys(f.bySource).map((k) => SOURCE_LABEL[k] ?? k)],
          ...FUNNEL_BUCKETS.map((b) => [
            statusLabel("invitation", b),
            f.counts[b],
            ...Object.values(f.bySource).map((s: any) => s[b]),
          ]),
          [],
          ["Sent (left draft)", f.sent],
          ["Acceptance rate (%)", f.acceptanceRate ?? "—"],
          ["Median hours sent to accepted", f.medianHoursToAccept ?? "—"],
        ]);
      } else if (kind === "offer") {
        download(`launch-offer_${stamp}.csv`, [
          ["Place", "Type", "Name", "Email", "First sent", "Accepted", "Free until"],
          ...all.offer.rows.map((r: any) => [
            r.place, r.type, r.name, r.email, r.first_sent_at, r.accepted_at ?? "", r.freeUntil ?? "",
          ]),
        ]);
      } else if (kind === "terms") {
        download(`terms-acceptances_${stamp}.csv`, [
          ["Name", "Email", "Role", "Terms", "Version", "Current", "Accepted at", "Document ID", "Body SHA-256", "Proof reference", "Hash added later"],
          ...all.terms.acceptances.map((a: any) => [
            a.user_full_name, a.user_email, a.user_role, a.doc_type, a.version, a.is_current ? "Yes" : "No",
            a.accepted_at, a.document_id, a.body_sha256, a.proof_ref, a.hash_retrospective ? "Yes" : "No",
          ]),
        ]);
      } else {
        download(`terms-not-accepted_${stamp}.csv`, [
          ["Name", "Email", "Terms", "Current version", "Last accepted version"],
          ...all.terms.outstanding.map((p: any) => [
            p.name, p.email, p.docType, p.currentVersion, p.lastAcceptedVersion ?? "None",
          ]),
        ]);
      }
    } catch (e) {
      toast.error(friendlyError(e, "We couldn't export the report."));
    }
  }

  const Pager = ({ offset, total, set }: { offset: number; total: number; set: (n: number) => void }) =>
    total > PAGE_SIZE ? (
      <div className="tvp-footer-actions">
        <span className="tvp-muted">
          {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
        </span>
        <button className="tvp-secondary" disabled={offset === 0} onClick={() => set(offset - PAGE_SIZE)}>
          Previous
        </button>
        <button className="tvp-secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => set(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    ) : null;

  const Csv = ({ kind }: { kind: "funnel" | "offer" | "terms" | "outstanding" }) => (
    <button className="tvp-secondary" onClick={() => exportCsv(kind)} disabled={!d}>
      <Download className="h-4 w-4" /> CSV
    </button>
  );

  return (
    <section className="tvp-stack" aria-label="Launch reports">
      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <h2 className="tvp-h2">Launch reports</h2>
          <button className="tvp-secondary" onClick={() => setEditing(true)}>
            <Settings2 className="h-4 w-4" /> Launch settings
          </button>
        </div>
        <FilterBar
          active={type !== "all" || segment !== "all" || accounts !== "real"}
          onChange={setFilter}
          onClear={() => navigate({ search: (prev) => ({ ...prev, type: undefined, talent: undefined, accounts: undefined }), replace: true })}
          filters={[
            {
              key: "type",
              label: "Type",
              value: type,
              options: [
                { value: "all", label: "All users" },
                { value: "agency", label: "Agency" },
                { value: "talent", label: "Talent" },
              ],
            },
            ...(type !== "agency"
              ? [
                  {
                    key: "talent",
                    label: "Talent",
                    value: segment,
                    options: [
                      { value: "all", label: "All talent" },
                      { value: "agency_linked", label: "Agency-linked" },
                      { value: "independent", label: "Independent" },
                    ],
                  },
                ]
              : []),
            {
              key: "accounts",
              label: "Accounts",
              value: accounts,
              options: ACCOUNT_SCOPES.map((v) => ({ value: v, label: ACCOUNT_SCOPE_LABEL[v] })),
            },
          ]}
        />
        {q.isLoading && <p className="tvp-muted">Loading launch reports…</p>}
        {q.isError && <p className="tvp-muted">{friendlyError(q.error, "We couldn't load the launch reports.")}</p>}
      </div>

      {d && (
        <>
          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Launch progress</h2>
              <span className="tvp-muted">
                Launch period: {fmtDate(d.progress.windowStart)} – {fmtDate(d.progress.windowEnd)}
              </span>
            </div>
            <div className="tvp-kpi-pair">
              {(
                [
                  ["talent", "Talent signed up", d.progress.talent, d.progress.talentTarget, d.progress.talentPct],
                  ["agencies", "Agencies signed up", d.progress.agencies, d.progress.agencyTarget, d.progress.agencyPct],
                ] as const
              ).map(([key, label, n, t, pct]) => (
                <div key={key} className="tvp-card tvp-kpi">
                  <div>
                    <div className="tvp-kpi-value">{n} / {t}</div>
                    <div className="tvp-kpi-label">{label}</div>
                    <div className="tvp-kpi-sub">{pct}% of target</div>
                    <button type="button" className="tvp-link" onClick={() => setViewing(key)}>
                      View data
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Launch offer · {d.settings.offer_free_months} months free</h2>
              <Csv kind="offer" />
            </div>
            <p className="tvp-muted">
              Places go to the first invitations sent on or after launch, in send order. A place is used once accepted; the
              free period runs from acceptance. Talent: {d.offer.talent.used} of {d.offer.talent.places} used
              ({d.offer.talent.allocated} allocated). Agencies: {d.offer.agency.used} of {d.offer.agency.places} used
              ({d.offer.agency.allocated} allocated).
            </p>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr><th>Place</th><th>Name</th><th>Type</th><th>First sent</th><th>Accepted</th><th>Free until</th></tr>
                </thead>
                <tbody>
                  {d.offer.rows.length === 0 && (
                    <tr><td colSpan={6} className="tvp-muted">No invitations have been sent since the launch date yet.</td></tr>
                  )}
                  {d.offer.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.place}</td>
                      <td><strong>{r.name}</strong><div className="tvp-muted">{r.email}</div></td>
                      <td><span className="tvp-status st-neutral">{r.type === "agency" ? "Agency" : "Talent"}</span></td>
                      <td>{fmtDate(r.first_sent_at)}</td>
                      <td>{fmtDate(r.accepted_at)}</td>
                      <td>{fmtDate(r.freeUntil)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={offerOffset} total={d.offer.total} set={setOfferOffset} />
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Invitation conversion</h2>
              <div className="tvp-actions">
                <button type="button" className="tvp-link" onClick={() => setViewing("invitations")}>
                  View data
                </button>
                <Csv kind="funnel" />
              </div>
            </div>
            <p className="tvp-muted">
              Invitations created in the date range. Each invitation counts once, however often it was resent.
            </p>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr>
                    <th>Status</th><th>Total</th>
                    {Object.keys(d.funnel.bySource).map((k) => <th key={k}>{SOURCE_LABEL[k] ?? k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.funnel.total === 0 && (
                    <tr><td colSpan={2} className="tvp-muted">No invitations in this date range.</td></tr>
                  )}
                  {d.funnel.total > 0 &&
                    FUNNEL_BUCKETS.map((b) => (
                      <tr key={b}>
                        <td><span className={statusPillClass("invitation", b)}>{statusLabel("invitation", b)}</span></td>
                        <td>{d.funnel.counts[b]}</td>
                        {Object.values(d.funnel.bySource).map((s: any, i) => <td key={i}>{s[b]}</td>)}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="tvp-muted">
              Acceptance rate: {d.funnel.acceptanceRate == null ? "—" : `${d.funnel.acceptanceRate}%`} of {d.funnel.sent} sent ·
              Median time to accept:{" "}
              {d.funnel.medianHoursToAccept == null ? "—" : `${d.funnel.medianHoursToAccept} hours`} ({d.funnel.acceptedMeasured} measured
              {d.funnel.acceptedWithoutSendTime > 0
                ? `; ${d.funnel.acceptedWithoutSendTime} sent before ${RECORDING_SINCE}, send time not recorded`
                : ""}
              ). No waiting list exists yet, so no invitation has that source.
            </p>
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Terms acceptances</h2>
              <Csv kind="terms" />
            </div>
            <p className="tvp-muted">
              Current: {d.terms.current.map((c: any) => `${c.doc_type === "agency" ? "Agency" : "Talent"} ${c.version}`).join(" · ") || "None"}.
              Accepted in the date range: {d.terms.acceptancesTotal}.
            </p>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead>
                  <tr><th>Name</th><th>Terms</th><th>Version</th><th>Accepted</th><th>Proof</th></tr>
                </thead>
                <tbody>
                  {d.terms.acceptances.length === 0 && (
                    <tr><td colSpan={5} className="tvp-muted">No Terms were accepted in this date range.</td></tr>
                  )}
                  {d.terms.acceptances.map((a: any) => (
                    <tr key={a.id}>
                      <td><strong>{a.user_full_name ?? "—"}</strong><div className="tvp-muted">{a.user_email}</div></td>
                      <td>{a.doc_type === "agency" ? "Agency" : "Talent"}</td>
                      <td>{a.version}{a.is_current ? "" : " (older)"}</td>
                      <td>{fmtDate(a.accepted_at)}</td>
                      <td title={a.body_sha256 ?? ""}>
                        {a.document_id.slice(0, 8)} · {a.body_sha256 ? a.body_sha256.slice(0, 12) : "—"}
                        {a.hash_retrospective ? " · hash added later" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={termsOffset} total={d.terms.acceptancesTotal} set={setTermsOffset} />
          </div>

          <div className="tvp-card tvp-panel">
            <div className="tvp-panel-head">
              <h2 className="tvp-h2">Not yet accepted the current Terms · {d.terms.outstandingTotal}</h2>
              <Csv kind="outstanding" />
            </div>
            <p className="tvp-muted">Everyone who must accept today, regardless of the date range. Administrators are exempt.</p>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead><tr><th>Name</th><th>Terms</th><th>Current version</th><th>Last accepted</th></tr></thead>
                <tbody>
                  {d.terms.outstanding.length === 0 && (
                    <tr><td colSpan={4} className="tvp-muted">Everyone in this view has accepted the current Terms.</td></tr>
                  )}
                  {d.terms.outstanding.map((p: any) => (
                    <tr key={`${p.user_id}-${p.docType}`}>
                      <td><strong>{p.name || "—"}</strong><div className="tvp-muted">{p.email}</div></td>
                      <td>{p.docType === "agency" ? "Agency" : "Talent"}</td>
                      <td>{p.currentVersion}</td>
                      <td>{p.lastAcceptedVersion ?? "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={outstandingOffset} total={d.terms.outstandingTotal} set={setOutstandingOffset} />
          </div>
        </>
      )}

      {editing && <SettingsDialog onClose={() => setEditing(false)} />}
      {viewing && d && (
        <RecordsDialog
          title={
            viewing === "talent"
              ? "Talent signed up"
              : viewing === "agencies"
                ? "Agencies signed up"
                : "Invitations counted"
          }
          rows={d.records[viewing]}
          fileName={`${viewing}_${accounts}_${from}_${to}.csv`}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

type RecordRow = {
  id: string;
  name: string;
  email: string;
  type: "agency" | "talent";
  is_test: boolean;
  agency: string | null;
  invited_at: string | null;
  signed_up_at: string | null;
  status: string;
  offer_place: number | null;
};

/** The exact records behind a report figure (row count = the figure). Admin only via the server function. */
function RecordsDialog({
  title,
  rows,
  fileName,
  onClose,
}: {
  title: string;
  rows: RecordRow[];
  fileName: string;
  onClose: () => void;
}) {
  const statusText = (r: RecordRow) =>
    r.type === "agency" && r.status !== "accepted" && r.status !== "pending"
      ? statusLabel("agency", r.status)
      : statusLabel("invitation", r.status);
  const csv = () =>
    download(fileName, [
      ["Name", "Email", "Type", "Account", "Agency link", "Invited", "Accepted / signed up", "Status", "Launch-offer place"],
      ...rows.map((r) => [
        r.name, r.email, r.type === "agency" ? "Agency" : "Talent", r.is_test ? "Test" : "Real",
        r.agency ?? "", r.invited_at ?? "", r.signed_up_at ?? "", statusText(r), r.offer_place ?? "",
      ]),
    ]);
  return (
    <ModalShell onClose={onClose} maxWidth={1040} labelledBy="lr-records-title">
      <div className="tvp-panel-head">
        <h2 className="tvp-h2" id="lr-records-title">{title} · {rows.length}</h2>
      </div>
      <div className="tvp-table-wrap">
        <table className="tvp-table">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Agency link</th><th>Invited</th><th>Signed up</th><th>Status</th><th>Offer place</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="tvp-muted">No records match these filters.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name || "—"}</strong>
                  {r.is_test && <span className="tvp-status st-neutral tvp-test-label">Test</span>}
                  <div className="tvp-muted">{r.email}</div>
                </td>
                <td><span className="tvp-status st-neutral">{r.type === "agency" ? "Agency" : "Talent"}</span></td>
                <td>{r.agency ?? "—"}</td>
                <td>{fmtDate(r.invited_at)}</td>
                <td>{fmtDate(r.signed_up_at)}</td>
                <td>{statusText(r)}</td>
                <td>{r.offer_place ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tvp-footer-actions">
        <button className="tvp-secondary" onClick={csv}>
          <Download className="h-4 w-4" /> CSV
        </button>
        <button className="tvp-primary" onClick={onClose}>Close</button>
      </div>
    </ModalShell>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getLaunchSettings);
  const saveFn = useServerFn(updateLaunchSettings);
  const s = useQuery({ queryKey: ["admin", "launch-settings"], queryFn: () => getFn() as Promise<any> });
  const [form, setForm] = useState<LaunchSettings | null>(null);
  useEffect(() => {
    if (s.data?.settings && !form) setForm(s.data.settings);
  }, [s.data, form]);
  const save = useMutation({
    mutationFn: (v: LaunchSettings) => saveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Launch settings saved.");
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e, "We couldn't save the launch settings.")),
  });
  return (
    <div role="dialog" aria-modal="true" aria-label="Launch settings" className="tvp-modal-backdrop" onClick={onClose}>
      <div className="tvp-card tvp-panel tvp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tvp-panel-head"><h2 className="tvp-h2">Launch settings</h2></div>
        {!form && <p className="tvp-muted">Loading…</p>}
        {form &&
          LAUNCH_SETTING_KEYS.map((k) => (
            <div key={k} className="tvp-form-group">
              <label htmlFor={`ls-${k}`}>{SETTING_LABEL[k]}</label>
              <input
                id={`ls-${k}`}
                type={k === "launch_date" ? "date" : "number"}
                min={0}
                value={form[k] as any}
                onChange={(e) =>
                  setForm({ ...form, [k]: k === "launch_date" ? e.target.value : Number(e.target.value) })
                }
              />
            </div>
          ))}
        <div className="tvp-footer-actions">
          <button className="tvp-secondary" onClick={onClose}>Cancel</button>
          <button className="tvp-primary" disabled={!form || save.isPending} onClick={() => form && save.mutate(form)}>
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
