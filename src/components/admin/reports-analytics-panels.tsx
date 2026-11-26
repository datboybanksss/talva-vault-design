import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Download, ArrowUp, ArrowDown, Minus, Columns3 } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportDefinition } from "./report-definition";
import { pct, SIGN_IN_HISTORY_NOTE, type Analytics, type Metric } from "@/lib/reports-analytics";
import type { ReportDefinitionKey } from "@/lib/reports-definitions";
import { fmtDate } from "@/lib/display-dates";
export type PanelProps = {
  data: Analytics;
  onPeople: (ids: string[]) => void;
  onDownload: (dataset: string) => void;
  canDownload: boolean;
};
export function ReportPanel({
  title,
  description,
  definition,
  dataset,
  children,
  onDownload,
  canDownload,
}: {
  title: string;
  description: string;
  definition: ReportDefinitionKey;
  dataset: string;
  children: ReactNode;
  onDownload: (s: string) => void;
  canDownload: boolean;
}) {
  return (
    <section className="report-card">
      <header className="report-section-head">
        <div>
          <h2>{title}</h2>
          <p className="report-meta">{description}</p>
        </div>
        <div className="report-head-actions">
          <ReportDefinition definition={definition} />
          <Button variant="outline" disabled={!canDownload} onClick={() => onDownload(dataset)}>
            <Download />
            Download CSV
          </Button>
        </div>
      </header>
      {children}
    </section>
  );
}
export function Comparison({ value, previous }: { value: number | string; previous?: number }) {
  if (typeof value !== "number" || previous === undefined)
    return <span className="report-meta">No comparison available</span>;
  const delta = Math.round((value - previous) * 10) / 10,
    Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <span
      className={`report-change ${delta > 0 ? "report-change-up" : delta < 0 ? "report-change-down" : "report-change-flat"}`}
    >
      <Icon />
      {delta === 0 ? "No change" : Math.abs(delta)} vs previous
    </span>
  );
}
export function MetricCards({
  metrics,
  onPeople,
}: {
  metrics: Metric[];
  onPeople: (ids: string[]) => void;
}) {
  return (
    <div className="report-kpi-grid">
      {metrics.map((m) => (
        <Button
          variant="ghost"
          key={m.label}
          className="report-kpi"
          onClick={() => onPeople(m.people)}
        >
          <span className="report-kpi-label">
            {m.label}
            <ChevronRight />
          </span>
          <strong>
            {typeof m.value === "number" ? m.value.toLocaleString("en-ZA") : m.value}
            {m.unit}
          </strong>
          <span className="report-meta">
            {m.helper ??
              (m.total !== undefined && typeof m.value === "number"
                ? `${m.value} of ${m.total} · ${pct(m.value, m.total)}%`
                : "In the selected period")}
          </span>
          {m.total !== undefined && m.total < 5 && (
            <span className="report-meta">Small sample</span>
          )}
          <Comparison
            value={m.value}
            {...(m.previous !== undefined ? { previous: m.previous } : {})}
          />
        </Button>
      ))}
    </div>
  );
}
function Funnel({
  rows,
  onPeople,
  compact = false,
}: {
  rows: Analytics["funnels"]["talent"];
  onPeople: (ids: string[]) => void;
  compact?: boolean;
}) {
  return (
    <div className={`report-funnel ${compact ? "report-funnel-compact" : ""}`}>
      {rows.map((r, i) => (
        <div key={r.label} className="report-funnel-row">
          <div className="report-funnel-label">
            <span className="report-step">{i + 1}</span>
            <strong>{r.label}</strong>
          </div>
          <div className="report-funnel-bar">
            <progress max={100} value={r.sent} />
            <Button variant="link" onClick={() => onPeople(r.people)}>
              {r.count} · {r.previous}% of previous step
            </Button>
          </div>
          {!compact && (
            <div className="report-meta">
              {r.sent}% of sent
              <br />
              {r.median === null ? "—" : `${r.median} days from previous step`}
            </div>
          )}
          {!compact && i > 0 && (
            <Button variant="link" onClick={() => onPeople(r.stopped)}>
              {r.stopped.length} have not{" "}
              {i === 1 ? "registered" : i === 2 ? "onboarded" : "returned"}
              <ChevronRight />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
function Trend({
  data,
  invites = false,
  onPeople,
}: {
  data: Analytics;
  invites?: boolean;
  onPeople: (ids: string[]) => void;
}) {
  const [group, setGroup] = useState<"week" | "day" | "month">("week"),
    [measure, setMeasure] = useState("active");
  const rows = data.trends[group].map((r) => ({
    ...r,
    label:
      group === "month"
        ? new Date(`${r.label}-01T12:00Z`).toLocaleDateString("en-ZA", {
            month: "short",
            year: "numeric",
          })
        : fmtDate(r.from),
    bar: invites
      ? r.sent
      : measure === "documents"
        ? r.documents
        : measure === "invitations"
          ? r.sent
          : measure === "sign_ins"
            ? r.sign_ins
            : r.active,
    line:
      invites || measure === "active"
        ? r.registrations
        : measure === "invitations"
          ? r.accepted
          : measure === "sign_ins"
            ? r.days_active
            : null,
  }));
  const barLabel = invites
      ? "Invitations sent"
      : measure === "documents"
        ? "Documents uploaded"
        : measure === "invitations"
          ? "Invitations sent"
          : measure === "sign_ins"
            ? "Sign-ins"
            : "Active users",
    lineLabel =
      invites || measure === "active"
        ? "New registrations"
        : measure === "invitations"
          ? "Invitations accepted"
          : "Days active";
  return (
    <>
      <div className="report-chart-controls">
        {!invites && (
          <label>
            Measure
            <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
              <option value="active">Active users and registrations</option>
              <option value="sign_ins">Sign-ins and days active</option>
              <option value="documents">Documents uploaded</option>
              <option value="invitations">Invitations sent and accepted</option>
            </select>
          </label>
        )}
        <label>
          Group by
          <select
            value={group}
            onChange={(e) =>
              setGroup(
                e.target.value === "day" ? "day" : e.target.value === "month" ? "month" : "week",
              )
            }
          >
            <option value="week">Week</option>
            <option value="day">Day</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>
      <div className="report-chart-legend">
        <span className="report-legend-bar" />
        {barLabel}
        {measure !== "documents" && (
          <>
            <span className="report-legend-line" />
            {lineLabel}
          </>
        )}
      </div>
      <div className="report-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 25, right: 15, bottom: 10, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--report-divider)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--report-muted)", fontSize: 12 }}
              minTickGap={30}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--report-muted)", fontSize: 12 }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "var(--report-surface)",
                borderColor: "var(--report-border)",
                color: "var(--report-ink)",
              }}
              formatter={(v: number, name: string) => [v, name === "bar" ? barLabel : lineLabel]}
            />
            <Bar
              dataKey="bar"
              name={barLabel}
              fill="var(--report-bar)"
              maxBarSize={34}
              onClick={(r) => onPeople(r.people ?? [])}
              radius={[3, 3, 0, 0]}
            >
              {rows.map((r) => (
                <Cell
                  key={r.from}
                  fill={r.ongoing ? "var(--report-bar-light)" : "var(--report-bar)"}
                />
              ))}
              <LabelList dataKey="bar" position="top" fill="var(--report-muted)" fontSize={12} />
            </Bar>
            {measure !== "documents" && (
              <Line
                dataKey="line"
                name={lineLabel}
                type="linear"
                stroke="var(--report-down)"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!invites && (measure === "active" || measure === "sign_ins") && (
        <p className="report-meta">
          {SIGN_IN_HISTORY_NOTE} Weeks with missing sign-ins are not shown as zero.
        </p>
      )}
      <details className="report-trend-data">
        <summary>View chart values</summary>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>{barLabel}</th>
                <th>{lineLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.from}>
                  <td>{r.label}</td>
                  <td>{r.bar ?? "Not recorded"}</td>
                  <td>{r.line ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function OverviewPanels({
  data: d,
  onPeople,
  onDownload,
  canDownload,
  north,
  previousNorth,
}: {
  north?: { active: number; total: number; people: string[] };
  previousNorth?: { active: number; total: number };
} & PanelProps) {
  const common = { onDownload, canDownload };
  return (
    <>
      <section className="report-card report-north">
        <div>
          <span className="report-eyebrow">NORTH STAR</span>
          <h2>Two-sided engagement</h2>
          <p>Agency and talent both active in their relationship.</p>
          <div className="report-head-actions">
            <ReportDefinition definition="north_star" />
            <Button variant="outline" disabled={!canDownload} onClick={() => onDownload("links")}>
              <Download />
              Download CSV
            </Button>
          </div>
        </div>
        <div className="report-north-result">
          <Button variant="link" onClick={() => onPeople(north?.people ?? [])}>
            <strong>{north ? pct(north.active, north.total) : "—"}%</strong>
          </Button>
          <p>
            {north?.active ?? "—"} of {north?.total ?? "—"} relationships
          </p>
          <Comparison
            value={north ? pct(north.active, north.total) : "—"}
            {...(previousNorth ? { previous: pct(previousNorth.active, previousNorth.total) } : {})}
          />
          <p className="report-meta">
            Previous period:{" "}
            {previousNorth ? `${pct(previousNorth.active, previousNorth.total)}%` : "Not available"}
          </p>
        </div>
      </section>
      <MetricCards metrics={d.metrics} onPeople={onPeople} />
      <p className="report-meta report-grid-helper">
        Select any figure to see the people behind it, with their full details and a download.
      </p>
      <ReportPanel
        {...common}
        title="Weekly trend"
        description="Activity and new registrations over the selected period."
        definition="sign_ins"
        dataset="sign_ins"
      >
        <Trend data={d} onPeople={onPeople} />
      </ReportPanel>
      <div className="report-two-columns">
        <ReportPanel
          {...common}
          title="Talent onboarding"
          description="From the first invitation to returning on a second day."
          definition="funnel"
          dataset="registrations"
        >
          <Funnel rows={d.funnels.talent} onPeople={onPeople} compact />
          <Button variant="link" onClick={() => onPeople(d.funnels.talent[0]?.people ?? [])}>
            Open full funnel
            <ChevronRight />
          </Button>
        </ReportPanel>
        <ReportPanel
          {...common}
          title="Needs attention"
          description="People and agencies that may need support."
          definition="dormant"
          dataset="people"
        >
          {d.attention.map((r) => (
            <Button
              variant="ghost"
              className="report-attention-row"
              key={r.label}
              onClick={() => onPeople(r.people)}
            >
              <span>
                <strong>{r.label}</strong>
                <span className="report-meta">
                  {r.people.length} people · {r.helper}
                </span>
              </span>
              <ChevronRight />
            </Button>
          ))}
          <p className="report-meta mt-3">
            Launch-discount members at risk: awaiting the verified launch sign-up sheet.
          </p>
        </ReportPanel>
      </div>
    </>
  );
}
export function GrowthPanels({ data: d, onPeople, onDownload, canDownload }: PanelProps) {
  const [type, setType] = useState<"talent" | "agency">("talent"),
    common = { onDownload, canDownload };
  return (
    <>
      <ReportPanel
        {...common}
        title="Launch progress"
        description="Registered accounts against the targets in Launch settings."
        definition="registered"
        dataset="registrations"
      >
        <div className="report-two-columns">
          {[
            { label: "Talent", n: d.launch.talent, target: d.launch.talent_target },
            { label: "Agencies", n: d.launch.agencies, target: d.launch.agency_target },
          ].map((r) => (
            <div key={r.label} className="report-launch-progress">
              <h3>{r.label}</h3>
              <Button variant="link" onClick={() => onPeople(d.people)}>
                {r.n} of {r.target ?? "Target not set"} target · {pct(r.n, r.target ?? 0)}%
              </Button>
              <progress value={r.n} max={r.target ?? 1} />
            </div>
          ))}
        </div>
        <p className="report-meta mt-4">
          Launch window: {fmtDate(d.launch.settings?.launch_date)} – {fmtDate(d.launch.end)}
        </p>
        <p className="report-meta">
          {d.launch.projection !== null
            ? `At the current pace, talent reaches ${d.launch.projection} by the end of the window, using the last four weeks’ pace.`
            : "Set a launch window to calculate a projection."}
        </p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Where invitations come from"
        description="First sends only; drafts and connection requests are separate."
        definition="funnel"
        dataset="invitations"
      >
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Sent</th>
                <th>Accepted</th>
                <th>Rate</th>
                <th>Median to accept</th>
              </tr>
            </thead>
            <tbody>
              {d.sources.map((r) => (
                <tr key={r.source}>
                  <td>{r.source.replaceAll("_", " ")}</td>
                  <td>
                    <Button variant="link" onClick={() => onPeople(r.people)}>
                      {r.sent}
                    </Button>
                  </td>
                  <td>
                    {r.accepted} of {r.sent} · {r.rate}%
                  </td>
                  <td>{r.rate}%</td>
                  <td>{r.median === null ? "—" : `${r.median} days`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.sources.map((r) => (
          <p className="report-meta mt-2" key={r.source}>
            {r.source.replaceAll("_", " ")}:{" "}
            {r.statuses.map((s) => `${s.count} ${s.status}`).join(" · ")}
          </p>
        ))}
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Onboarding funnel"
        description="Every dated step from invitation to a second active day."
        definition="funnel"
        dataset="registrations"
      >
        <div className="report-segment report-local-segment">
          <Button
            variant="ghost"
            aria-pressed={type === "talent"}
            onClick={() => setType("talent")}
          >
            Talent
          </Button>
          <Button
            variant="ghost"
            aria-pressed={type === "agency"}
            onClick={() => setType("agency")}
          >
            Agencies
          </Button>
        </div>
        <Funnel rows={d.funnels[type]} onPeople={onPeople} />
        <p className="report-meta mt-3">
          {SIGN_IN_HISTORY_NOTE} Returning figures use recorded days only.
        </p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Registrations and invitations by week"
        description="Sent invitations and new registrations throughout the selected period."
        definition="registered"
        dataset="invitations"
      >
        <Trend data={d} invites onPeople={onPeople} />
      </ReportPanel>
    </>
  );
}
export function EngagementPanels({ data: d, onPeople, onDownload, canDownload }: PanelProps) {
  const [type, setType] = useState("talent"),
    g = d.activity.find((a) => a.type === type),
    common = { onDownload, canDownload };
  return (
    <>
      <ReportPanel
        {...common}
        title="Sign-in activity"
        description="Separate account sign-ins and successful trusted-contact access-code visits."
        definition="sign_ins"
        dataset="sign_ins"
      >
        <div className="report-segment report-local-segment">
          {[
            { id: "agency_staff", label: "Agency staff" },
            { id: "talent", label: "Talent" },
            { id: "trusted_contact", label: "Trusted contacts" },
          ].map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              aria-pressed={type === t.id}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {g && (
          <>
            <MetricCards metrics={g.metrics} onPeople={onPeople} />
            <h3 className="mt-5">When people sign in</h3>
            <div className="report-weekdays">
              {g.weekdays.map((day) => (
                <div
                  key={day.label}
                  className={day.count > 0 ? "report-day-active" : "report-day-empty"}
                >
                  <span>{day.label}</span>
                  <strong>{day.count}</strong>
                </div>
              ))}
            </div>
            <p className="report-meta">
              Busiest hours (South African time):{" "}
              {g.hours.length
                ? g.hours
                    .map((h) => `${String(h.hour).padStart(2, "0")}:00 · ${h.count}`)
                    .join(" · ")
                : "No recorded visits or sign-ins"}
            </p>
            <h3 className="mt-4">Devices</h3>
            <div className="report-device-bar">
              {g.devices.map((device) => (
                <span key={device.device} className={`report-device-${device.device}`}>
                  {device.device}: {device.count}
                </span>
              ))}
            </div>
            <p className="report-meta">{g.new_devices} new-device sign-ins</p>
          </>
        )}
        <p className="report-meta mt-4">
          {type === "trusted_contact"
            ? `Trusted-contact visits are recorded from ${fmtDate(d.contacts.started_at)}. A visit is a successful access-code entry, not an account sign-in.`
            : SIGN_IN_HISTORY_NOTE}
        </p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Retention by joining month"
        description="People who signed in around their 30-, 60- and 90-day milestones."
        definition="retention"
        dataset="sign_ins"
      >
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Joining month</th>
                <th>Users</th>
                <th>30 days</th>
                <th>60 days</th>
                <th>90 days</th>
              </tr>
            </thead>
            <tbody>
              {d.cohorts.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>
                    <Button variant="link" onClick={() => onPeople(r.people)}>
                      {r.count}
                    </Button>
                  </td>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={
                        c.status === "known"
                          ? `report-retention-${c.percent >= 75 ? "high" : c.percent >= 25 ? "medium" : "low"}`
                          : ""
                      }
                    >
                      {c.status === "known" ? (
                        <Button variant="link" onClick={() => onPeople(c.people)}>
                          {c.percent}% · {c.n} of {c.m}
                        </Button>
                      ) : (
                        c.status
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-meta mt-3">{SIGN_IN_HISTORY_NOTE}</p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Vault depth"
        description="Documents held per registered talent at the selected cut-off."
        definition="onboarded"
        dataset="documents"
      >
        <div className="report-depth">
          {d.depth.map((r) => (
            <div key={r.label}>
              <Button variant="link" onClick={() => onPeople(r.people)}>
                {r.label}
              </Button>
              <progress value={r.count} max={r.total || 1} />
              <span>
                {r.count} of {r.total} · {pct(r.count, r.total)}%
              </span>
            </div>
          ))}
        </div>
        <MetricCards
          onPeople={onPeople}
          metrics={[
            {
              label: "Documents per active talent",
              value: d.documents.per_active,
              people: d.people,
            },
            {
              label: "Uploaded a second document",
              value: d.documents.second,
              total: d.total_talent,
              people: d.documents.second_people,
            },
          ]}
        />
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Documents"
        description="Document dates, types and sharing — never file contents."
        definition="onboarded"
        dataset="documents"
      >
        <MetricCards
          onPeople={onPeople}
          metrics={[
            { label: "Uploaded", value: d.documents.uploaded, people: d.all_document_people },
            {
              label: "Shared with an agency",
              value: d.documents.shared,
              total: d.documents.uploaded,
              people: d.shared_document_people,
            },
            {
              label: "Kept in private vaults",
              value: d.documents.private,
              people: d.private_document_people,
            },
            {
              label: "Expiring in the next 60 days",
              value: d.documents.expiring,
              people: d.expiring_document_people,
            },
          ]}
        />
        <div className="report-table-scroll mt-4">
          <table>
            <thead>
              <tr>
                <th>Document type</th>
                <th>Uploaded</th>
                <th>Talent with one</th>
                <th>Shared</th>
                <th>Private</th>
              </tr>
            </thead>
            <tbody>
              {d.documentTypes.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td>
                    <Button variant="link" onClick={() => onPeople(r.people)}>
                      {r.uploaded}
                    </Button>
                  </td>
                  <td>{r.talent}</td>
                  <td>{r.shared}</td>
                  <td>{r.private}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Trusted contacts"
        description="People given access and their successful visits."
        definition="trusted_contacts"
        dataset="shares"
      >
        <MetricCards
          onPeople={onPeople}
          metrics={[
            {
              label: "Recipients given access",
              value: d.contacts.recipients,
              people: d.contact_recipients,
            },
            { label: "Shares created", value: d.contacts.shares, people: d.contacts.people },
            { label: "Visits", value: d.contacts.visits, people: d.contact_visitors },
            {
              label: "Documents opened or downloaded",
              value: d.contacts.documents,
              people: d.contact_document_people,
            },
          ]}
        />
        <p className="report-meta mt-3">
          Visits are recorded from {fmtDate(d.contacts.started_at)}.
        </p>
      </ReportPanel>
    </>
  );
}
export function AgencyPanels({ data: d, onPeople, onDownload, canDownload }: PanelProps) {
  const [search, setSearch] = useState(""),
    [health, setHealth] = useState("all"),
    [choose, setChoose] = useState(false),
    [columns, setColumns] = useState([
      "Staff",
      "Staff active",
      "Talent invited",
      "Registered",
      "Active talent",
      "Documents",
      "Invoiced (R)",
      "Last activity",
      "Health",
    ]);
  const allColumns = [
      "Staff",
      "Staff active",
      "Talent invited",
      "Registered",
      "Active talent",
      "Documents",
      "Invoiced (R)",
      "Last activity",
      "Health",
    ],
    rows = d.agencyRows.filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) &&
        (health === "all" || a.health === health),
    );
  const common = { onDownload, canDownload },
    onboarded = d.agencyRows.filter((a) => a.onboarded),
    active = d.agencyRows.filter((a) => a.active > 0),
    received = d.agencyRows.reduce((n, a) => n + a.received, 0);
  return (
    <>
      <MetricCards
        onPeople={onPeople}
        metrics={[
          {
            label: "Agencies onboarded vs target",
            value: onboarded.length,
            total: d.launch.agency_target ?? undefined,
            people: onboarded.flatMap((a) => a.people),
          },
          {
            label: "Agencies with active talent",
            value: active.length,
            total: d.agencyRows.length,
            people: active.flatMap((a) => a.people),
          },
          {
            label: "Talent per agency",
            value: d.agencyRows.length
              ? Math.round(
                  (d.agencyRows.reduce((n, a) => n + a.registered, 0) / d.agencyRows.length) * 10,
                ) / 10
              : 0,
            people: d.people,
          },
          {
            label: "Quotes and invoices issued",
            value: received,
            unit: " R",
            people: d.people,
            helper: "Payments received in ZAR",
          },
        ]}
      />
      <ReportPanel
        {...common}
        title="Agency performance"
        description="Current membership with dated activity and billing."
        definition="health"
        dataset="links"
      >
        <div className="report-chart-controls">
          <label>
            Search agencies
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Health
            <select value={health} onChange={(e) => setHealth(e.target.value)}>
              <option value="all">All health</option>
              {[...new Set(d.agencyRows.map((a) => a.health))].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={() => setChoose(true)}>
            <Columns3 />
            Columns
          </Button>
        </div>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Agency</th>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const values: Record<string, ReactNode> = {
                  Staff: a.staff,
                  "Staff active": `${a.staff_active} of ${a.staff} · ${pct(a.staff_active, a.staff)}%`,
                  "Talent invited": a.invited,
                  Registered: a.registered,
                  "Active talent": `${a.active} of ${a.registered} · ${pct(a.active, a.registered)}%`,
                  Documents: a.documents,
                  "Invoiced (R)": a.invoiced.toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
                  "Last activity": fmtDate(a.last_activity),
                  Health: (
                    <span
                      className={`report-health report-health-${a.health.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {a.health}
                    </span>
                  ),
                };
                return (
                  <tr key={a.id}>
                    <td>
                      <Link to="/admin/agencies/$id" params={{ id: a.id }}>
                        {a.name}
                      </Link>
                    </td>
                    {columns.map((c) => (
                      <td key={c}>{values[c]}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="report-meta mt-3">
          Healthy: at least half of registered talent active. Needs support: recent activity, fewer
          active talent. Dormant: no activity for 30 days with complete sign-in history. New: joined
          fewer than 30 days ago.
        </p>
      </ReportPanel>
      <Dialog open={choose} onOpenChange={setChoose}>
        <DialogContent>
          <DialogTitle>Agency columns</DialogTitle>
          {allColumns.map((c) => (
            <label key={c} className="flex gap-3 items-center min-h-11">
              <Checkbox
                checked={columns.includes(c)}
                onCheckedChange={(v) =>
                  setColumns(
                    v
                      ? allColumns.filter((x) => x === c || columns.includes(x))
                      : columns.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function BusinessPanels({ data: d, onPeople, onDownload, canDownload }: PanelProps) {
  const common = { onDownload, canDownload },
    last = d.months.at(-1),
    before = d.months.at(-2),
    growth = before?.total ? pct((last?.total ?? 0) - before.total, before.total) : null;
  return (
    <>
      <section className="report-card report-investor">
        <h2>Investor pack</h2>
        <p>Real accounts, full historical growth and shared definitions.</p>
        <div className="report-head-actions">
          <Button
            variant="outline"
            onClick={() =>
              document.getElementById("report-definitions")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            View definitions
          </Button>
          <Button variant="outline" disabled={!canDownload} onClick={() => onDownload("investor")}>
            <Download />
            Download investor pack
          </Button>
        </div>
      </section>
      <p className="report-meta mb-4">Business always uses real accounts.</p>
      <MetricCards
        onPeople={onPeople}
        metrics={[
          {
            label: "Accounts on TalVault",
            value: d.total_talent + d.launch.agencies,
            people: d.people,
            helper: "Talent plus registered agencies",
          },
          {
            label: "Month-on-month growth",
            value: growth ?? "No previous registrations",
            unit: growth === null ? "" : "%",
            people: last?.people ?? [],
          },
          {
            label: "Monthly active share",
            value: pct(d.monthly_active_people.length, d.total_users),
            unit: "%",
            total: d.total_users,
            people: d.monthly_active_people,
          },
          {
            label: "Committed monthly revenue",
            value: "Not set",
            people: [],
            helper: "Calculates once plan prices are set",
          },
        ]}
      />
      <ReportPanel
        {...common}
        title="Revenue"
        description="Paid plans start in 2027; plan prices have not been set."
        definition="accounts"
        dataset="billing"
      >
        <MetricCards
          onPeople={onPeople}
          metrics={[
            { label: "Paying accounts", value: 0, people: [], helper: "No paid plan records" },
            {
              label: "Accounts in free period",
              value: "Not set",
              people: [],
              helper: "Free-period dates have not been recorded",
            },
            {
              label: "Hold the 20% launch discount",
              value: "Awaiting sheet",
              people: [],
              helper: "Awaiting the verified launch sign-up sheet",
            },
            {
              label: "Average revenue per account",
              value: "Not set",
              people: [],
              helper: "Calculates once plan prices are set",
            },
          ]}
        />
        <div className="report-table-scroll mt-4">
          <table>
            <thead>
              <tr>
                <th>Free-period end month</th>
                <th>Accounts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2}>Free-period end dates have not been recorded.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Launch discount"
        description="Keep-by dates and eligibility require the verified sign-up sheet."
        definition="accounts"
        dataset="people"
      >
        <p>Awaiting the verified launch sign-up sheet</p>
        <p className="report-meta">Members · Kept · At risk · Lost · Earliest keep-by date</p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Growth by month"
        description="Every joining month since the first record."
        definition="registered"
        dataset="registrations"
      >
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Talent</th>
                <th>Agencies</th>
                <th>New accounts</th>
                <th>Active users</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{r.talent}</td>
                  <td>{r.agencies}</td>
                  <td>
                    <Button variant="link" onClick={() => onPeople(r.people)}>
                      {r.total}
                    </Button>
                  </td>
                  <td>{r.active ?? "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Network effect"
        description="Connections between talent, agencies and trusted contacts."
        definition="north_star"
        dataset="links"
      >
        <MetricCards
          onPeople={onPeople}
          metrics={[
            {
              label: "Talent linked to agencies",
              value: d.network.linked,
              total: d.total_talent,
              people: d.network_linked_people,
            },
            {
              label: "Talent with multiple agencies",
              value: d.network.multi,
              total: d.total_talent,
              people: d.network_multi_people,
            },
            {
              label: "Talent sharing with trusted contacts",
              value: d.network.contact_talent,
              total: d.total_talent,
              people: d.contacts.people,
            },
          ]}
        />
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Acquisition cost by channel"
        description="Cost per registered account from recorded monthly spend."
        definition="registered"
        dataset="invitations"
      >
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Registered</th>
                <th>Monthly spend</th>
                <th>Cost per registration</th>
              </tr>
            </thead>
            <tbody>
              {d.sources.map((r) => (
                <tr key={r.source}>
                  <td>{r.source.replaceAll("_", " ")}</td>
                  <td>{r.accepted}</td>
                  <td>Not supplied</td>
                  <td>Not available</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="outline"
          disabled
          className="mt-3"
          title="Monthly spend entry is not available yet"
        >
          Add monthly spend
        </Button>
        <p className="report-meta">Monthly spend has not been supplied.</p>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Feature adoption"
        description="Talent using documents and sharing at the selected cut-off."
        definition="onboarded"
        dataset="activity"
      >
        <div className="report-depth">
          {[
            { label: "Own document upload", count: d.funnels.talent[2]?.count ?? 0 },
            { label: "Agency connections", count: d.network.linked },
            { label: "Trusted-contact sharing", count: d.network.contact_talent },
            { label: "Second document upload", count: d.documents.second },
          ].map((r) => (
            <div key={r.label}>
              <Button variant="link" onClick={() => onPeople(d.people)}>
                {r.label}
              </Button>
              <progress value={r.count} max={d.total_talent || 1} />
              <span>
                {r.count} of {d.total_talent} · {pct(r.count, d.total_talent)}%
              </span>
            </div>
          ))}
        </div>
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Trust and security"
        description="Terms acceptances and document validation, without private contents."
        definition="privacy"
        dataset="terms"
      >
        <MetricCards
          onPeople={onPeople}
          metrics={[
            {
              label: "Terms accepted",
              value: d.trust.terms,
              total: d.total_users,
              people: d.terms_people,
            },
            {
              label: "Validated uploads",
              value: d.trust.validated,
              total: d.documents.uploaded,
              people: d.validated_people,
            },
            {
              label: "Uploads awaiting validation",
              value: d.trust.unvalidated,
              total: d.documents.uploaded,
              people: d.unvalidated_people,
            },
          ]}
        />
      </ReportPanel>
      <ReportPanel
        {...common}
        title="Data quality"
        description="What is excluded and why."
        definition="privacy"
        dataset="people"
      >
        <ul className="report-quality">
          <li>Administrators and deleted profiles are excluded from usage figures.</li>
          <li>Test accounts are excluded from Business.</li>
          <li>{SIGN_IN_HISTORY_NOTE} Missing sign-ins never establish inactivity.</li>
          <li>{d.quality.undated} people have no joining date; no date is invented.</li>
          <li>{d.quality.unknown_devices} sign-ins have no device information.</li>
          <li>
            {d.quality.other_currencies} non-rand billing records are excluded from rand totals;
            their original currencies remain in downloads.
          </li>
          <li>Launch-discount eligibility awaits the verified sign-up sheet.</li>
          <li>Plan prices, free-period dates and acquisition spend have not been supplied.</li>
        </ul>
      </ReportPanel>
    </>
  );
}
