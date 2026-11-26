import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Download, ArrowUp, ArrowDown, Minus, Columns3, Plus } from "lucide-react";
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportDefinition } from "./report-definition";
import {
  pct,
  channelLabel,
  CHANNEL_KEYS,
  SIGN_IN_HISTORY_NOTE,
  type Analytics,
  type Metric,
  type SectionId,
} from "@/lib/reports-analytics";
import { setReportChannelSpend } from "@/lib/reports-analytics.functions";
import type { ReportDefinitionKey } from "@/lib/reports-definitions";
import { fmtDate } from "@/lib/display-dates";
import { friendlyError } from "@/lib/friendly-error";

export type ReportActions = {
  /** Opens People filtered to exactly these people. */
  onPeople: (ids: string[], label: string) => void;
  onDownload: (section: SectionId | "north_star") => void;
  onTab: (tab: "growth") => void;
  onInvestorPack: () => void;
  canDownload: boolean;
  canManageSpend: boolean;
};
const Actions = createContext<ReportActions | null>(null);
export const ReportActionsProvider = Actions.Provider;
function useActions() {
  const actions = useContext(Actions);
  if (!actions) throw new Error("Report sections need their actions.");
  return actions;
}
export type PanelProps = { data: Analytics };
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Photo (JPEG)",
  "image/png": "Image (PNG)",
  "image/webp": "Image (WebP)",
  "image/heic": "Photo (HEIC)",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel spreadsheet",
};
const fileTypeLabel = (mime: string) => FILE_TYPES[mime] ?? mime;
/** "Sep 2026" — the same month names as every other date in the app. */
const monthLabel = (month: string) => fmtDate(`${month}-01T12:00:00Z`).replace(/^\d+ /, "");
const figure = (value: number) =>
  Number.isInteger(value) ? value.toLocaleString("en-ZA") : String(value);
const rand = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Any number on the page: opens People with exactly the people behind it. */
export function Drill({
  people,
  label,
  children,
  className = "",
}: {
  people: string[];
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { onPeople } = useActions();
  return (
    <Button
      variant="link"
      className={`report-drill ${className}`}
      data-drill={people.length}
      title={`See the ${people.length} ${people.length === 1 ? "person" : "people"} behind this figure`}
      onClick={() => onPeople(people, label)}
    >
      {children}
    </Button>
  );
}
export function ReportPanel({
  title,
  description,
  definition,
  section,
  children,
}: {
  title: string;
  description: string;
  definition: ReportDefinitionKey;
  section: SectionId;
  children: ReactNode;
}) {
  const { onDownload, canDownload } = useActions();
  return (
    <section className="report-card">
      <header className="report-section-head">
        <div>
          <h2>{title}</h2>
          <p className="report-meta">{description}</p>
        </div>
        <div className="report-head-actions">
          <ReportDefinition definition={definition} />
          <Button variant="outline" disabled={!canDownload} onClick={() => onDownload(section)}>
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
const peopleWord = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
export function MetricCards({
  metrics,
  group = "",
  comparison = true,
}: {
  metrics: Metric[];
  group?: string;
  comparison?: boolean;
}) {
  const { onPeople } = useActions();
  return (
    <div className="report-kpi-grid">
      {metrics.map((m) => {
        const numeric = typeof m.value === "number";
        const body = (
          <>
            <span className="report-kpi-label">
              {m.label}
              {numeric && <ChevronRight />}
            </span>
            <strong>
              {typeof m.value === "number" ? figure(m.value) : m.value}
              {m.unit}
            </strong>
            <span className="report-meta">
              {m.helper ??
                (m.total !== undefined && typeof m.value === "number"
                  ? `${m.value} of ${m.total} · ${pct(m.value, m.total)}%`
                  : numeric
                    ? "In the selected period"
                    : "")}
            </span>
            {numeric && m.value !== m.people.length && (
              <span className="report-meta">{peopleWord(m.people.length)} behind this figure</span>
            )}
            {numeric && m.total !== undefined && m.total < 5 && (
              <span className="report-meta">Small sample</span>
            )}
            {comparison && numeric && (
              <Comparison
                value={m.value}
                {...(m.previous !== undefined ? { previous: m.previous } : {})}
              />
            )}
          </>
        );
        return numeric ? (
          <Button
            variant="ghost"
            key={m.label}
            className="report-kpi"
            data-drill={m.people.length}
            onClick={() => onPeople(m.people, group ? `${group} · ${m.label}` : m.label)}
          >
            {body}
          </Button>
        ) : (
          <div key={m.label} className="report-kpi report-kpi-static">
            {body}
          </div>
        );
      })}
    </div>
  );
}
function Bars({ rows, group }: { rows: Metric[]; group: string }) {
  return (
    <div className="report-depth">
      {rows.map((r) => (
        <div key={r.label}>
          <span className="report-depth-label">{r.label}</span>
          <progress value={Number(r.value)} max={r.total || 1} />
          <Drill people={r.people} label={`${group} · ${r.label}`}>
            {r.value} of {r.total ?? 0} · {pct(Number(r.value), r.total ?? 0)}%
          </Drill>
        </div>
      ))}
    </div>
  );
}
function Funnel({
  rows,
  group,
  compact = false,
}: {
  rows: Analytics["funnels"]["talent"];
  group: string;
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
            <Drill people={r.people} label={`${group} · ${r.label}`}>
              {r.count} · {r.previous}% of previous step
            </Drill>
          </div>
          {!compact && (
            <div className="report-meta">
              {r.sent}% of sent
              <br />
              {r.median === null ? "—" : `${r.median} days from previous step`}
            </div>
          )}
          {!compact && i > 0 && (
            <Drill
              people={r.stopped}
              label={`${group} · have not ${i === 1 ? "registered" : i === 2 ? "onboarded" : "returned"}`}
            >
              {r.stopped.length} have not{" "}
              {i === 1 ? "registered" : i === 2 ? "onboarded" : "returned"}
              <ChevronRight />
            </Drill>
          )}
        </div>
      ))}
    </div>
  );
}
type TrendRow = Analytics["trends"]["week"][number];
function Trend({ data, invites = false }: { data: Analytics; invites?: boolean }) {
  const { onPeople } = useActions();
  const [group, setGroup] = useState<"week" | "day" | "month">("week"),
    [chosen, setMeasure] = useState("active");
  const measure = invites ? "invitations_registrations" : chosen;
  const pick = (r: TrendRow) =>
    measure === "documents"
      ? { bar: r.documents, line: null, barPeople: r.people.documents, linePeople: [] }
      : measure === "invitations"
        ? {
            bar: r.sent,
            line: r.accepted,
            barPeople: r.people.sent,
            linePeople: r.people.accepted,
          }
        : measure === "invitations_registrations"
          ? {
              bar: r.sent,
              line: r.registrations,
              barPeople: r.people.sent,
              linePeople: r.people.registrations,
            }
          : measure === "sign_ins"
            ? {
                bar: r.sign_ins,
                line: r.days_active,
                barPeople: r.people.active,
                linePeople: r.people.active,
              }
            : {
                bar: r.active,
                line: r.registrations,
                barPeople: r.people.active,
                linePeople: r.people.registrations,
              };
  const rows = data.trends[group].map((r) => ({
    ...r,
    ...pick(r),
    label: group === "month" ? monthLabel(r.label) : fmtDate(r.from),
  }));
  const barLabel =
      measure === "documents"
        ? "Documents uploaded"
        : measure === "invitations" || measure === "invitations_registrations"
          ? "Invitations sent"
          : measure === "sign_ins"
            ? "Sign-ins"
            : "Active users",
    lineLabel =
      measure === "invitations"
        ? "Invitations accepted"
        : measure === "sign_ins"
          ? "Days active"
          : "New registrations";
  return (
    <>
      <div className="report-chart-controls">
        {!invites && (
          <label>
            Measure
            <select value={chosen} onChange={(e) => setMeasure(e.target.value)}>
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
              formatter={(v: number, name: string) => [v, name]}
            />
            <Bar
              dataKey="bar"
              name={barLabel}
              fill="var(--report-bar)"
              maxBarSize={34}
              onClick={(r: { barPeople?: string[]; label?: string }) =>
                onPeople(r.barPeople ?? [], `${barLabel} · ${r.label ?? ""}`)
              }
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
      {(measure === "active" || measure === "sign_ins") && (
        <p className="report-meta">
          {SIGN_IN_HISTORY_NOTE} Periods with missing sign-ins are shown as “Not recorded”, never as
          zero.
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
                {measure !== "documents" && <th>{lineLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.from}>
                  <td>{r.label}</td>
                  <td>
                    {r.bar === null ? (
                      "Not recorded"
                    ) : (
                      <Drill people={r.barPeople} label={`${barLabel} · ${r.label}`}>
                        {r.bar}
                      </Drill>
                    )}
                  </td>
                  {measure !== "documents" && (
                    <td>
                      {r.line === null ? (
                        "Not recorded"
                      ) : (
                        <Drill people={r.linePeople} label={`${lineLabel} · ${r.label}`}>
                          {r.line}
                        </Drill>
                      )}
                    </td>
                  )}
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
  north,
  previousNorth,
}: {
  north?: { active: number; total: number; people: string[] };
  previousNorth?: { active: number; total: number };
} & PanelProps) {
  const { onDownload, onTab, onPeople, canDownload } = useActions();
  return (
    <>
      <section className="report-card report-north">
        <div>
          <span className="report-eyebrow">NORTH STAR</span>
          <h2>Two-sided engagement</h2>
          <p>Agency and talent both active in their relationship.</p>
          <div className="report-head-actions">
            <ReportDefinition definition="north_star" />
            <Button
              variant="outline"
              disabled={!canDownload}
              onClick={() => onDownload("north_star")}
            >
              <Download />
              Download CSV
            </Button>
          </div>
        </div>
        <div className="report-north-result">
          {north ? (
            <Drill people={north.people} label="Two-sided engagement">
              <strong>{pct(north.active, north.total)}%</strong>
            </Drill>
          ) : (
            <strong>—</strong>
          )}
          <p>
            {north?.active ?? "—"} of {north?.total ?? "—"} relationships
            {north ? ` · ${peopleWord(north.people.length)}` : ""}
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
      <MetricCards metrics={d.metrics} />
      <div className="report-grid-helper">
        <p className="report-meta">
          Select any figure to see the people behind it, with their full details and a download.
        </p>
        <Button
          variant="outline"
          disabled={!canDownload}
          onClick={() => onDownload("overview_kpis")}
        >
          <Download />
          Download CSV
        </Button>
      </div>
      <ReportPanel
        title="Weekly trend"
        description="Activity and new registrations over the selected period."
        definition="sign_ins"
        section="overview_trend"
      >
        <Trend data={d} />
      </ReportPanel>
      <div className="report-two-columns">
        <ReportPanel
          title="Talent onboarding"
          description="From the first invitation to returning on a second day."
          definition="funnel"
          section="overview_funnel"
        >
          <Funnel rows={d.funnels.talent} group="Talent onboarding" compact />
          <Button variant="link" onClick={() => onTab("growth")}>
            Open full funnel
            <ChevronRight />
          </Button>
        </ReportPanel>
        <ReportPanel
          title="Needs attention"
          description="People and agencies that may need support."
          definition="dormant"
          section="overview_attention"
        >
          {d.attention.map((r) => (
            <Button
              variant="ghost"
              className="report-attention-row"
              key={r.label}
              data-drill={r.people.length}
              onClick={() => onPeople(r.people, r.label)}
            >
              <span>
                <strong>{r.label}</strong>
                <span className="report-meta">
                  {peopleWord(r.people.length)} · {r.helper}
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
export function GrowthPanels({ data: d }: PanelProps) {
  const [type, setType] = useState<"talent" | "agency">("talent");
  return (
    <>
      <ReportPanel
        title="Launch progress"
        description="Registered accounts against the targets in Launch settings."
        definition="registered"
        section="growth_launch"
      >
        <div className="report-two-columns">
          {d.figures.launch.map((r) => (
            <div key={r.label} className="report-launch-progress">
              <h3>{r.label}</h3>
              <Drill people={r.people} label={`Launch progress · ${r.label}`}>
                {r.total === undefined
                  ? `${r.value} · target not set`
                  : `${r.value} of ${r.total} target · ${pct(Number(r.value), r.total)}%`}
              </Drill>
              <progress value={Number(r.value)} max={r.total ?? 1} />
              {r.value !== r.people.length && (
                <p className="report-meta">{peopleWord(r.people.length)} in these agencies</p>
              )}
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
        title="Where invitations come from"
        description="First sends only; drafts and connection requests are separate."
        definition="funnel"
        section="growth_sources"
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
                  <td>{channelLabel(r.source)}</td>
                  <td>
                    <Drill people={r.people} label={`Invitations sent · ${channelLabel(r.source)}`}>
                      {r.sent}
                    </Drill>
                  </td>
                  <td>
                    <Drill
                      people={r.accepted_people}
                      label={`Invitations accepted · ${channelLabel(r.source)}`}
                    >
                      {r.accepted} of {r.sent}
                    </Drill>
                  </td>
                  <td>{r.rate}%</td>
                  <td>{r.median === null ? "—" : `${r.median} days`}</td>
                </tr>
              ))}
              {d.sources.length === 0 && (
                <tr>
                  <td colSpan={5}>No invitations were sent in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {d.sources.map((r) => (
          <p className="report-meta report-status-line" key={r.source}>
            {channelLabel(r.source)}:
            {r.statuses.map((s) => (
              <Drill
                key={s.status}
                people={s.people}
                label={`Invitations ${s.status} · ${channelLabel(r.source)}`}
              >
                {s.count} {s.status}
              </Drill>
            ))}
          </p>
        ))}
        <p className="report-meta mt-2">
          An invitation sent to someone who already has a row in People opens that person.
          {d.funnel_unlisted > 0 &&
            ` ${d.funnel_unlisted} invitations went to people who are not in the People list for these filters.`}
        </p>
      </ReportPanel>
      <ReportPanel
        title="Onboarding funnel"
        description="Every dated step from invitation to a second active day."
        definition="funnel"
        section="growth_funnel"
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
        <Funnel
          rows={d.funnels[type]}
          group={type === "talent" ? "Talent funnel" : "Agency funnel"}
        />
        <p className="report-meta mt-3">
          {SIGN_IN_HISTORY_NOTE} Returning figures use recorded days only.
        </p>
      </ReportPanel>
      <ReportPanel
        title="Registrations and invitations by week"
        description="Sent invitations and new registrations throughout the selected period."
        definition="registered"
        section="growth_weekly"
      >
        <Trend data={d} invites />
      </ReportPanel>
    </>
  );
}
const ACTIVITY_GROUPS = [
  { id: "agency_staff", label: "Agency staff" },
  { id: "talent", label: "Talent" },
  { id: "trusted_contact", label: "Trusted contacts" },
] as const;
export function EngagementPanels({ data: d }: PanelProps) {
  const [type, setType] = useState<(typeof ACTIVITY_GROUPS)[number]["id"]>("talent"),
    g = d.activity.find((a) => a.type === type),
    groupLabel = ACTIVITY_GROUPS.find((t) => t.id === type)?.label ?? "";
  return (
    <>
      <ReportPanel
        title="Sign-in activity"
        description="Account sign-ins, and separately the successful access-code visits by trusted contacts."
        definition="sign_ins"
        section="engagement_activity"
      >
        <div className="report-segment report-local-segment">
          {ACTIVITY_GROUPS.map((t) => (
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
            <MetricCards metrics={g.metrics} group={groupLabel} comparison={false} />
            <h3 className="mt-5">
              {type === "trusted_contact" ? "When people visit" : "When people sign in"}
            </h3>
            <div className="report-weekdays">
              {g.weekdays.map((day) => (
                <div
                  key={day.label}
                  className={day.count > 0 ? "report-day-active" : "report-day-empty"}
                >
                  <span>{day.label}</span>
                  <Drill people={day.people} label={`${groupLabel} · ${day.label}`}>
                    {day.count}
                  </Drill>
                </div>
              ))}
            </div>
            <p className="report-meta report-status-line">
              Busiest hours (South African time):
              {g.hours.length
                ? g.hours.map((h) => (
                    <Drill
                      key={h.hour}
                      people={h.people}
                      label={`${groupLabel} · ${String(h.hour).padStart(2, "0")}:00`}
                    >
                      {String(h.hour).padStart(2, "0")}:00 · {h.count}
                    </Drill>
                  ))
                : " none recorded"}
            </p>
            <h3 className="mt-4">Devices</h3>
            <div className="report-device-bar">
              {g.devices.map((device) => (
                <span key={device.device} className={`report-device-${device.device}`}>
                  <Drill people={device.people} label={`${groupLabel} · ${device.device} device`}>
                    {device.device === "unknown"
                      ? "Not recorded"
                      : device.device === "mobile"
                        ? "Mobile"
                        : "Desktop"}
                    : {device.count}
                  </Drill>
                </span>
              ))}
            </div>
            <p className="report-meta report-status-line">
              <Drill people={g.new_device_people} label={`${groupLabel} · new-device sign-ins`}>
                {g.new_devices} new-device sign-ins
              </Drill>
            </p>
          </>
        )}
        <p className="report-meta mt-4">
          {type === "trusted_contact"
            ? `Trusted-contact visits are recorded from ${fmtDate(d.contacts_started_at)}. A visit is a successful access-code entry, not an account sign-in.`
            : SIGN_IN_HISTORY_NOTE}
        </p>
      </ReportPanel>
      <ReportPanel
        title="Retention by joining month"
        description="People who signed in around their 30-, 60- and 90-day milestones."
        definition="retention"
        section="engagement_retention"
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
                  <td>{monthLabel(r.month)}</td>
                  <td>
                    <Drill people={r.people} label={`Joined ${monthLabel(r.month)}`}>
                      {r.count}
                    </Drill>
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
                        <Drill
                          people={c.people}
                          label={`Joined ${monthLabel(r.month)} · active at ${[30, 60, 90][i]} days`}
                        >
                          {c.percent}% · {c.n} of {c.m}
                        </Drill>
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
        title="Vault depth"
        description="Documents held per registered talent at the selected cut-off."
        definition="onboarded"
        section="engagement_depth"
      >
        <Bars
          group="Vault depth"
          rows={d.depth.map((r) => ({
            label: r.label,
            value: r.count,
            total: r.total,
            people: r.people,
          }))}
        />
        <MetricCards metrics={d.figures.depth} group="Vault depth" comparison={false} />
      </ReportPanel>
      <ReportPanel
        title="Documents"
        description="Document dates, types and sharing — never file contents."
        definition="onboarded"
        section="engagement_documents"
      >
        <MetricCards metrics={d.figures.documents} group="Documents" comparison={false} />
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
                  <td>{fileTypeLabel(r.type)}</td>
                  <td>
                    <Drill people={r.people} label={`${fileTypeLabel(r.type)} · uploaded`}>
                      {r.uploaded}
                    </Drill>
                  </td>
                  <td>
                    <Drill people={r.people} label={`${fileTypeLabel(r.type)} · talent with one`}>
                      {r.talent}
                    </Drill>
                  </td>
                  <td>
                    <Drill people={r.shared_people} label={`${fileTypeLabel(r.type)} · shared`}>
                      {r.shared}
                    </Drill>
                  </td>
                  <td>
                    <Drill people={r.private_people} label={`${fileTypeLabel(r.type)} · private`}>
                      {r.private}
                    </Drill>
                  </td>
                </tr>
              ))}
              {d.documentTypes.length === 0 && (
                <tr>
                  <td colSpan={5}>No documents were uploaded in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ReportPanel>
      <ReportPanel
        title="Trusted contacts"
        description="People given access and their successful visits."
        definition="trusted_contacts"
        section="engagement_contacts"
      >
        <MetricCards metrics={d.figures.contacts} group="Trusted contacts" comparison={false} />
        <p className="report-meta mt-3">
          Visits are recorded from {fmtDate(d.contacts_started_at)}.
        </p>
      </ReportPanel>
    </>
  );
}
const AGENCY_COLUMNS = [
  "Staff",
  "Staff active",
  "Talent invited",
  "Registered",
  "Active talent",
  "Documents",
  "Invoiced (R)",
  "Last activity",
  "Health",
];
export function AgencyPanels({ data: d }: PanelProps) {
  const [search, setSearch] = useState(""),
    [health, setHealth] = useState("all"),
    [choose, setChoose] = useState(false),
    [columns, setColumns] = useState(AGENCY_COLUMNS);
  const rows = d.agencyRows.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) &&
      (health === "all" || a.health === health),
  );
  return (
    <>
      <MetricCards metrics={d.figures.agencies} group="Agencies" comparison={false} />
      <ReportPanel
        title="Agency performance"
        description="Current membership with dated activity and billing."
        definition="health"
        section="agencies_performance"
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
                const drill = (people: string[], what: string, text: ReactNode) => (
                  <Drill people={people} label={`${a.name.trim()} · ${what}`}>
                    {text}
                  </Drill>
                );
                const values: Record<string, ReactNode> = {
                  Staff: drill(a.people_by.staff, "staff", a.staff),
                  "Staff active": drill(
                    a.people_by.staff_active,
                    "active staff",
                    `${a.staff_active} of ${a.staff} · ${pct(a.staff_active, a.staff)}%`,
                  ),
                  "Talent invited": drill(a.people_by.invited, "talent invited", a.invited),
                  Registered: drill(a.people_by.registered, "registered talent", a.registered),
                  "Active talent": drill(
                    a.people_by.active,
                    "active talent",
                    `${a.active} of ${a.registered} · ${pct(a.active, a.registered)}%`,
                  ),
                  Documents: drill(a.people_by.documents, "documents", a.documents),
                  "Invoiced (R)": drill(
                    a.people_by.invoiced,
                    "quotes and invoices",
                    a.invoiced.toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
                  ),
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1}>No agencies match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="report-meta mt-3">
          Healthy: at least half of registered talent active. Needs support: recent activity, fewer
          active talent. Dormant: no activity for 30 days. New: joined fewer than 30 days ago.
        </p>
      </ReportPanel>
      <Dialog open={choose} onOpenChange={setChoose}>
        <DialogContent>
          <DialogTitle>Agency columns</DialogTitle>
          {AGENCY_COLUMNS.map((c) => (
            <label key={c} className="flex gap-3 items-center min-h-11">
              <Checkbox
                checked={columns.includes(c)}
                onCheckedChange={(v) =>
                  setColumns(
                    v
                      ? AGENCY_COLUMNS.filter((x) => x === c || columns.includes(x))
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
function SpendDialog({
  data: d,
  open,
  onOpenChange,
}: {
  data: Analytics;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useServerFn(setReportChannelSpend),
    client = useQueryClient();
  const [channel, setChannel] = useState("admin"),
    [month, setMonth] = useState(d.period.to.slice(0, 7)),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false);
  const channels = [...new Set([...CHANNEL_KEYS, ...d.spend.map((s) => s.channel)])];
  async function submit(value: number | null, target = { channel, month }) {
    setBusy(true);
    try {
      await save({ data: { ...target, amount: value } });
      await client.invalidateQueries({ queryKey: ["admin", "reports-historical-analytics"] });
      toast.success(value === null ? "Spend entry removed." : "Monthly spend saved.");
      setAmount("");
    } catch (e) {
      toast.error(friendlyError(e, "The spend could not be saved. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  const parsed = Number(amount.replace(",", ".")),
    valid =
      amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && /^\d{4}-\d{2}$/.test(month);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogTitle>Monthly spend</DialogTitle>
        <p className="report-meta">
          Record what was spent on a channel in a month, in rand. Saving again for the same channel
          and month replaces the amount. Every change is recorded in the audit log.
        </p>
        <form
          className="report-spend-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void submit(parsed);
          }}
        >
          <label>
            Channel
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label>
            Amount (R)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <Button type="submit" disabled={!valid || busy}>
            Save spend
          </Button>
        </form>
        <h3 className="mt-2">Recorded spend</h3>
        {d.spend.length === 0 ? (
          <p className="report-meta">No spend has been recorded yet.</p>
        ) : (
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Channel</th>
                  <th>Amount</th>
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.spend.map((s) => (
                  <tr key={`${s.channel}-${s.month}`}>
                    <td>{monthLabel(s.month)}</td>
                    <td>{channelLabel(s.channel)}</td>
                    <td>{rand(s.amount_cents / 100)}</td>
                    <td>
                      <Button
                        variant="link"
                        disabled={busy}
                        onClick={() => void submit(null, { channel: s.channel, month: s.month })}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function BusinessPanels({ data: d }: PanelProps) {
  const { onInvestorPack, canDownload, canManageSpend } = useActions();
  const [spendOpen, setSpendOpen] = useState(false);
  return (
    <>
      <section className="report-card report-investor">
        <div>
          <h2>Investor pack</h2>
          <p>
            A board-ready PDF of these figures, the monthly series since the first record, the
            definitions and the data dictionary. Always real accounts.
          </p>
        </div>
        <div className="report-head-actions">
          <Button
            variant="outline"
            onClick={() =>
              document.getElementById("report-definitions")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            View definitions
          </Button>
          <Button variant="outline" disabled={!canDownload} onClick={onInvestorPack}>
            <Download />
            Download investor pack
          </Button>
        </div>
      </section>
      <p className="report-meta mb-4">Business always uses real accounts.</p>
      <MetricCards
        group="Business"
        comparison={false}
        metrics={[
          ...d.figures.business,
          {
            label: "Committed monthly revenue",
            value: "Not set",
            people: [],
            helper: "Calculates once plan prices are set",
          },
        ]}
      />
      <ReportPanel
        title="Revenue"
        description="Paid plans start in 2027; plan prices have not been set."
        definition="accounts"
        section="business_revenue"
      >
        <MetricCards
          group="Revenue"
          comparison={false}
          metrics={[
            { label: "Paying accounts", value: 0, people: [], helper: "Paid plans start in 2027" },
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
        title="Launch discount"
        description="Keep-by dates and eligibility require the verified sign-up sheet."
        definition="accounts"
        section="business_discount"
      >
        <p>Awaiting the verified launch sign-up sheet</p>
        <p className="report-meta">
          Members, kept, at risk, lost and the earliest keep-by date appear here once the sheet is
          imported.
        </p>
      </ReportPanel>
      <ReportPanel
        title="Growth by month"
        description="Every joining month since the first record."
        definition="registered"
        section="business_months"
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
                  <td>{monthLabel(r.month)}</td>
                  <td>
                    <Drill people={r.talent_people} label={`${monthLabel(r.month)} · new talent`}>
                      {r.talent}
                    </Drill>
                  </td>
                  <td>
                    <Drill people={r.agency_people} label={`${monthLabel(r.month)} · new agencies`}>
                      {r.agencies}
                    </Drill>
                  </td>
                  <td>
                    <Drill people={r.people} label={`${monthLabel(r.month)} · new accounts`}>
                      {r.total}
                    </Drill>
                  </td>
                  <td>
                    {r.active === null ? (
                      "Not recorded"
                    ) : (
                      <Drill
                        people={r.active_people}
                        label={`${monthLabel(r.month)} · active users`}
                      >
                        {r.active}
                      </Drill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-meta mt-3">
          An agency opens its staff in People, so the number of people can differ from the number of
          agencies.
        </p>
      </ReportPanel>
      <ReportPanel
        title="Network effect"
        description="Connections between talent, agencies and trusted contacts."
        definition="north_star"
        section="business_network"
      >
        <MetricCards metrics={d.figures.network} group="Network effect" comparison={false} />
      </ReportPanel>
      <ReportPanel
        title="Acquisition cost by channel"
        description="Cost per registered account, from the monthly spend recorded for the selected period."
        definition="registered"
        section="business_acquisition"
      >
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Registered</th>
                <th>Spend in period</th>
                <th>Cost per registration</th>
              </tr>
            </thead>
            <tbody>
              {d.acquisition.map((r) => (
                <tr key={r.channel}>
                  <td>{channelLabel(r.channel)}</td>
                  <td>
                    <Drill people={r.people} label={`Registered · ${channelLabel(r.channel)}`}>
                      {r.registered}
                    </Drill>
                  </td>
                  <td>{r.spend === null ? "Not supplied" : rand(r.spend)}</td>
                  <td>{r.cost === null ? "Not available" : rand(r.cost)}</td>
                </tr>
              ))}
              {d.acquisition.length === 0 && (
                <tr>
                  <td colSpan={4}>No invitations or spend in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canManageSpend ? (
          <Button variant="outline" className="mt-3" onClick={() => setSpendOpen(true)}>
            <Plus />
            Add monthly spend
          </Button>
        ) : (
          <p className="report-meta mt-3">
            Reports Owners and Operations administrators can record monthly spend.
          </p>
        )}
        {spendOpen && <SpendDialog data={d} open onOpenChange={setSpendOpen} />}
      </ReportPanel>
      <ReportPanel
        title="Feature adoption"
        description="Talent using documents and sharing at the selected cut-off."
        definition="onboarded"
        section="business_adoption"
      >
        <Bars rows={d.figures.adoption} group="Feature adoption" />
      </ReportPanel>
      <ReportPanel
        title="Trust and security"
        description="Terms acceptances and document validation, without private contents."
        definition="privacy"
        section="business_trust"
      >
        <MetricCards metrics={d.figures.trust} group="Trust and security" comparison={false} />
      </ReportPanel>
      <ReportPanel
        title="Data quality"
        description="What is excluded and why."
        definition="privacy"
        section="business_quality"
      >
        <ul className="report-quality">
          <li>Administrators and deleted profiles are excluded from usage figures.</li>
          <li>Test accounts are excluded from Business.</li>
          <li>{SIGN_IN_HISTORY_NOTE} Missing sign-ins never count as inactivity.</li>
          {d.figures.quality.map((f) => (
            <li key={f.label}>
              {f.label}:{" "}
              <Drill people={f.people} label={f.label}>
                {f.value}
              </Drill>
              {f.label.startsWith("Billing") &&
                " — left out of rand totals; original currencies remain in downloads."}
              {f.label.startsWith("People") && " — no date is invented."}
            </li>
          ))}
          <li>Launch-discount eligibility awaits the verified sign-up sheet.</li>
          <li>Plan prices and free-period dates have not been supplied.</li>
        </ul>
      </ReportPanel>
    </>
  );
}
