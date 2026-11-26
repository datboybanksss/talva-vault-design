import { z } from "zod";
import { ReportPerson } from "./reports-contract";
import { sastDay } from "./sign-in-metering";

export const SIGN_IN_HISTORY_NOTE =
  "Sign-ins are recorded from 14 September 2026. Sign-ins between 15 and 24 November 2026 were not recorded.";
export const HistoryRecord = z.object({
  id: z.string(),
  kind: z.string(),
  at: z.string(),
  person_id: z.string().nullable().optional(),
  agency_id: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  accepted_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  recipient_id: z.string().optional(),
  visibility: z.string().optional(),
  validated: z.boolean().optional(),
  own: z.boolean().nullable().optional(),
  value: z.number().optional(),
  currency: z.string().nullable().optional(),
  device: z.string().optional(),
  new_device: z.boolean().optional(),
  document_id: z.string().optional(),
  version: z.string().optional(),
  target_type: z.string().nullable().optional(),
  target_id: z.string().nullable().optional(),
});
export const HistorySnapshot = z.object({
  people: z.array(ReportPerson),
  records: z.array(HistoryRecord),
  agencies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      created_at: z.string(),
      status: z.string(),
      is_test: z.boolean(),
    }),
  ),
  launch: z
    .object({
      launch_date: z.string(),
      talent_target: z.number(),
      agency_target: z.number(),
      window_months: z.number(),
      offer_free_months: z.number(),
    })
    .nullable(),
  contact_started_at: z.string(),
  as_of: z.string(),
});
export type History = z.infer<typeof HistorySnapshot>;
export type RecordRow = z.infer<typeof HistoryRecord>;
export type Metric = {
  label: string;
  value: number | string;
  total?: number;
  people: string[];
  previous?: number;
  helper?: string;
  unit?: string;
};
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
export const moveDay = (d: string, n: number) =>
  new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
export function loginRangeComplete(from: string, to: string) {
  return from >= "2026-09-14" && to >= from && !(from <= "2026-11-24" && to >= "2026-11-15");
}
export const inRange = (at: string | null | undefined, from: string, to: string) =>
  !!at && sastDay(at) >= from && sastDay(at) <= to;
const unique = (ids: (string | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is string => !!id)),
];
const ids = (rows: RecordRow[]) => unique(rows.map((r) => r.person_id));
const median = (numbers: number[]) => {
  const sorted = numbers.filter((n) => n >= 0 && Number.isFinite(n)).sort((a, b) => a - b),
    n = sorted.length;
  if (!n) return null;
  const a = sorted[Math.floor((n - 1) / 2)],
    b = sorted[Math.floor(n / 2)];
  return a === undefined || b === undefined ? null : Math.round(((a + b) / 2) * 10) / 10;
};
const daysBetween = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
export function periodMetrics(h: History, from: string, to: string) {
  const registered = h.people.filter(
    (p) => p.registered && (!p.registered_at || sastDay(p.registered_at) <= to),
  );
  const users = registered.filter((p) => p.account_type !== "trusted_contact");
  const talent = users.filter((p) => p.account_type === "talent");
  const events = h.records.filter((r) => inRange(r.at, from, to));
  const logins = events.filter((r) => r.kind === "sign_in");
  const active = unique(logins.map((r) => r.person_id)).filter((id) =>
    users.some((p) => p.person_id === id),
  );
  const returning = active.filter(
    (id) => new Set(logins.filter((r) => r.person_id === id).map((r) => sastDay(r.at))).size >= 2,
  );
  const onboarded = talent.filter((p) => p.onboarded_at && sastDay(p.onboarded_at) <= to);
  const invitations = events.filter((r) => r.kind === "invitation" && r.type !== "connection");
  const accepted = invitations.filter((r) => r.accepted_at && sastDay(r.accepted_at) <= to);
  const dormant = users.filter((p) => {
    if (!loginRangeComplete(moveDay(to, -29), to) || !p.registered_at) return false;
    const last =
      h.records
        .filter((r) => r.kind === "sign_in" && r.person_id === p.person_id && sastDay(r.at) <= to)
        .sort((a, b) => b.at.localeCompare(a.at))[0]?.at ?? p.registered_at;
    return daysBetween(last, `${to}T23:59:59+02:00`) >= 30;
  });
  const metrics: Metric[] = [
    { label: "Active users", value: active.length, total: users.length, people: active },
    { label: "Returning users", value: returning.length, total: users.length, people: returning },
    {
      label: "Onboarding rate",
      value: pct(onboarded.length, talent.length),
      unit: "%",
      total: talent.length,
      people: onboarded.map((p) => p.person_id),
      helper: `${onboarded.length} of ${talent.length} talent · ${pct(onboarded.length, talent.length)}%`,
    },
    {
      label: "Invitations accepted",
      value: accepted.length,
      total: invitations.length,
      people: ids(accepted),
    },
    {
      label: "Dormant users",
      value: loginRangeComplete(moveDay(to, -29), to) ? dormant.length : "Not recorded",
      total: users.length,
      people: dormant.map((p) => p.person_id),
      helper: "30+ days without a sign-in",
    },
  ];
  return { metrics, users, talent, active, returning, onboarded, events, invitations, dormant };
}
export function trendRows(h: History, from: string, to: string, group: "week" | "day" | "month") {
  const rows: {
    from: string;
    to: string;
    label: string;
    active: number | null;
    registrations: number;
    sign_ins: number | null;
    days_active: number | null;
    documents: number;
    sent: number;
    accepted: number;
    people: string[];
    ongoing: boolean;
  }[] = [];
  let start = from;
  if (group === "month") start = from.slice(0, 7) + "-01";
  if (group === "week") {
    const d = new Date(`${from}T12:00Z`).getUTCDay();
    start = moveDay(from, -((d + 6) % 7));
  }
  while (start <= to) {
    const next =
      group === "day"
        ? moveDay(start, 1)
        : group === "week"
          ? moveDay(start, 7)
          : new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1, 12))
              .toISOString()
              .slice(0, 10);
    const end = moveDay(next, -1),
      lo = start < from ? from : start,
      hi = end > to ? to : end;
    const events = h.records.filter((r) => inRange(r.at, lo, hi)),
      logins = events.filter((r) => r.kind === "sign_in");
    rows.push({
      from: lo,
      to: hi,
      label: group === "month" ? start.slice(0, 7) : start,
      active: loginRangeComplete(lo, hi) ? ids(logins).length : null,
      registrations: events.filter((r) => r.kind === "registration").length,
      sign_ins: loginRangeComplete(lo, hi) ? logins.length : null,
      days_active: loginRangeComplete(lo, hi)
        ? unique(logins.map((r) => `${r.person_id}:${sastDay(r.at)}`)).length
        : null,
      documents: events.filter((r) => r.kind === "document").length,
      sent: events.filter((r) => r.kind === "invitation" && r.type !== "connection").length,
      accepted: h.records.filter(
        (r) => r.kind === "invitation" && r.type !== "connection" && inRange(r.accepted_at, lo, hi),
      ).length,
      people: ids(events),
      ongoing: end >= sastDay(h.as_of),
    });
    start = next;
  }
  return rows;
}
export function funnelRows(h: History, to: string, type: "talent" | "agency", from = "1900-01-01") {
  const invites = h.records.filter(
    (r) =>
      r.kind === "invitation" &&
      (type === "talent" ? r.type === "talent" || r.type === "inert" : r.type === "agency") &&
      inRange(r.at, from, to),
  );
  const accepted = invites.filter((r) => r.accepted_at && sastDay(r.accepted_at) <= to);
  const registeredIds = ids(accepted);
  const onboarded =
    type === "talent"
      ? h.people
          .filter(
            (p) =>
              registeredIds.includes(p.person_id) &&
              p.onboarded_at &&
              sastDay(p.onboarded_at) <= to,
          )
          .map((p) => ({ id: p.person_id, at: p.onboarded_at ?? "" }))
      : accepted
          .filter((i) =>
            h.records.some(
              (r) =>
                r.kind === "invitation" &&
                r.source === "agency" &&
                r.agency_id === i.agency_id &&
                sastDay(r.at) <= to,
            ),
          )
          .map((i) => ({
            id: i.person_id ?? i.id,
            at:
              h.records
                .filter(
                  (r) =>
                    r.kind === "invitation" && r.source === "agency" && r.agency_id === i.agency_id,
                )
                .sort((a, b) => a.at.localeCompare(b.at))[0]?.at ?? "",
          }));
  const returned = onboarded.filter(
    (p) =>
      new Set(
        h.records
          .filter((r) => r.kind === "sign_in" && r.person_id === p.id && sastDay(r.at) <= to)
          .map((r) => sastDay(r.at)),
      ).size >= 2,
  );
  const sets = [
    unique(invites.map((i) => i.person_id ?? i.id)),
    registeredIds,
    unique(onboarded.map((p) => p.id)),
    unique(returned.map((p) => p.id)),
  ];
  const times = [
    null,
    median(accepted.map((i) => daysBetween(i.at, i.accepted_at ?? i.at))),
    median(
      onboarded.map((p) => {
        const invite = accepted.find((i) => i.person_id === p.id);
        return daysBetween(invite?.accepted_at ?? p.at, p.at);
      }),
    ),
    median(
      returned.map((p) => {
        const logins = h.records
          .filter((r) => r.kind === "sign_in" && r.person_id === p.id && sastDay(r.at) <= to)
          .sort((a, b) => a.at.localeCompare(b.at));
        const day = logins[0]?.at;
        const second = logins.find((r) => day && sastDay(r.at) !== sastDay(day));
        return second ? daysBetween(p.at, second.at) : 0;
      }),
    ),
  ];
  return [
    "Invitations sent",
    "Registered",
    type === "talent" ? "Uploaded a document (onboarded)" : "Invited a talent (onboarded)",
    "Returned on a second day",
  ].map((label, index) => {
    const people = sets[index] ?? [],
      prev = index ? (sets[index - 1] ?? []) : people;
    return {
      label,
      count: people.length,
      people,
      previous: pct(people.length, prev.length),
      sent: pct(people.length, sets[0]?.length ?? 0),
      median: times[index] ?? null,
      stopped: prev.filter((id) => !people.includes(id)),
    };
  });
}
export function analyseHistory(
  h: History,
  from: string,
  to: string,
  prior: { from: string; to: string } | null,
  firstDate: string,
) {
  const current = periodMetrics(h, from, to),
    previous = prior ? periodMetrics(h, prior.from, prior.to) : null;
  const metrics = current.metrics.map((m, i) => {
    const p = previous?.metrics[i]?.value;
    return {
      ...m,
      ...(typeof p === "number" &&
      (i === 2 ||
        i === 3 ||
        (prior && loginRangeComplete(from, to) && loginRangeComplete(prior.from, prior.to)))
        ? { previous: p }
        : {}),
    };
  });
  const invitations = current.invitations;
  const sources = unique(invitations.map((r) => r.source ?? "Unspecified")).map((source) => {
    const rows = invitations.filter((r) => (r.source ?? "Unspecified") === source),
      accepted = rows.filter((r) => r.accepted_at && sastDay(r.accepted_at) <= to);
    return {
      source,
      sent: rows.length,
      accepted: accepted.length,
      rate: pct(accepted.length, rows.length),
      median: median(accepted.map((r) => daysBetween(r.at, r.accepted_at ?? r.at))),
      people: ids(rows),
      statuses: ["accepted", "pending", "expired", "declined", "revoked"].map((status) => ({
        status,
        count: rows.filter((r) =>
          status === "accepted"
            ? !!r.accepted_at && sastDay(r.accepted_at) <= to
            : r.status === status,
        ).length,
      })),
    };
  });
  const docs = h.records.filter(
      (r) => r.kind === "document" && sastDay(r.at) <= to && !r.deleted_at,
    ),
    uploads = current.events.filter((r) => r.kind === "document");
  const documentTypes = unique(uploads.map((r) => r.type ?? "Unspecified")).map((type) => {
    const rows = uploads.filter((r) => (r.type ?? "Unspecified") === type);
    return {
      type,
      uploaded: rows.length,
      talent: ids(rows).length,
      shared: rows.filter((r) => r.visibility === "shared").length,
      private: rows.filter((r) => r.visibility === "private").length,
      people: ids(rows),
    };
  });
  const depth = [
    { label: "No documents", min: 0, max: 0 },
    { label: "1 document", min: 1, max: 1 },
    { label: "2–4 documents", min: 2, max: 4 },
    { label: "5 or more", min: 5, max: Infinity },
  ].map((b) => {
    const people = current.talent
      .filter((p) => {
        const n = docs.filter((r) => r.person_id === p.person_id).length;
        return n >= b.min && n <= b.max;
      })
      .map((p) => p.person_id);
    return { label: b.label, count: people.length, total: current.talent.length, people };
  });
  const cohorts = trendRows(h, firstDate, to, "month").map((month) => {
    const people = current.users.filter(
      (p) => p.registered_at && sastDay(p.registered_at).slice(0, 7) === month.label,
    );
    return {
      month: month.label,
      count: people.length,
      people: people.map((p) => p.person_id),
      cells: [30, 60, 90].map((days) => {
        const due = people.filter(
          (p) => p.registered_at && moveDay(sastDay(p.registered_at), days) <= to,
        );
        if (!due.length)
          return { status: "Not yet due", n: 0, m: 0, percent: 0, people: [] as string[] };
        const complete = due.every(
          (p) =>
            p.registered_at &&
            loginRangeComplete(
              moveDay(sastDay(p.registered_at), days - 29),
              moveDay(sastDay(p.registered_at), days),
            ),
        );
        if (!complete)
          return {
            status: "Not recorded",
            n: 0,
            m: due.length,
            percent: 0,
            people: [] as string[],
          };
        const active = due.filter(
          (p) =>
            p.registered_at &&
            h.records.some(
              (r) =>
                r.kind === "sign_in" &&
                r.person_id === p.person_id &&
                inRange(
                  r.at,
                  moveDay(sastDay(p.registered_at ?? ""), days - 29),
                  moveDay(sastDay(p.registered_at ?? ""), days),
                ),
            ),
        );
        return {
          status: "known",
          n: active.length,
          m: due.length,
          percent: pct(active.length, due.length),
          people: active.map((p) => p.person_id),
        };
      }),
    };
  });
  const agencyRows = h.agencies
    .map((a) => {
      const staff = current.users.filter(
          (p) => p.account_type === "agency_staff" && p.agency_ids.includes(a.id),
        ),
        links = h.records.filter(
          (r) => r.kind === "agency_link" && r.agency_id === a.id && sastDay(r.at) <= to,
        ),
        talent = unique(links.map((r) => r.person_id)),
        active = talent.filter((id) => current.active.includes(id)),
        invs = h.records.filter(
          (r) =>
            r.kind === "invitation" &&
            r.source === "agency" &&
            r.agency_id === a.id &&
            sastDay(r.at) <= to,
        );
      const latest =
        h.records
          .filter(
            (r) =>
              (r.agency_id === a.id ||
                staff.some((p) => p.person_id === r.person_id) ||
                talent.includes(r.person_id ?? "")) &&
              ["sign_in", "vault_activity", "agency_activity"].includes(r.kind) &&
              sastDay(r.at) <= to,
          )
          .sort((x, y) => y.at.localeCompare(x.at))[0]?.at ?? null;
      const registered = h.people.filter((p) => p.registered && talent.includes(p.person_id));
      const onboarding = invs.length > 0,
        age = daysBetween(a.created_at, `${to}T23:59:59+02:00`);
      const health =
        age < 30
          ? "New"
          : registered.length > 0 && active.length >= registered.length / 2
            ? "Healthy"
            : latest && daysBetween(latest, `${to}T23:59:59+02:00`) < 30
              ? "Needs support"
              : loginRangeComplete(moveDay(to, -29), to)
                ? "Dormant"
                : "Not recorded";
      return {
        ...a,
        staff: staff.length,
        staff_active: staff.filter((p) => current.active.includes(p.person_id)).length,
        invited: invs.length,
        registered: registered.length,
        active: active.length,
        documents: docs.filter((r) => r.agency_id === a.id).length,
        invoiced:
          current.events
            .filter((r) => r.kind === "invoice" && r.agency_id === a.id && r.currency === "ZAR")
            .reduce((s, r) => s + (r.value ?? 0), 0) / 100,
        received:
          current.events
            .filter((r) => r.kind === "payment" && r.agency_id === a.id && r.currency === "ZAR")
            .reduce((s, r) => s + (r.value ?? 0), 0) / 100,
        last_activity: latest,
        health,
        onboarded: onboarding,
        people: unique([...staff.map((p) => p.person_id), ...talent]),
      };
    })
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  const contacts = current.events.filter((r) => r.kind === "contact_share"),
    visits = current.events.filter((r) => r.kind === "contact_visit"),
    contactDocs = current.events.filter((r) => r.kind === "contact_document");
  const activity = ["agency_staff", "talent", "trusted_contact"].map((type) => {
    const people = h.people.filter(
        (p) => p.account_type === type && (p.registered || type === "trusted_contact"),
      ),
      events = current.events.filter(
        (r) =>
          r.kind === (type === "trusted_contact" ? "contact_visit" : "sign_in") &&
          people.some((p) => p.person_id === r.person_id),
      ),
      active = ids(events),
      returning = active.filter(
        (id) =>
          new Set(events.filter((r) => r.person_id === id).map((r) => sastDay(r.at))).size >= 2,
      ),
      dormant = current.dormant.filter((p) => p.account_type === type);
    const metrics: Metric[] = [
      { label: "Active", value: active.length, total: people.length, people: active },
      { label: "Returning", value: returning.length, total: people.length, people: returning },
      {
        label: type === "trusted_contact" ? "Total visits" : "Total sign-ins",
        value: events.length,
        people: active,
      },
      {
        label: "Average days active",
        value: active.length
          ? Math.round(
              (active.reduce(
                (n, id) =>
                  n +
                  new Set(events.filter((r) => r.person_id === id).map((r) => sastDay(r.at))).size,
                0,
              ) /
                active.length) *
                10,
            ) / 10
          : 0,
        people: active,
      },
      {
        label: "Dormant",
        value:
          type === "trusted_contact"
            ? "Not recorded"
            : loginRangeComplete(moveDay(to, -29), to)
              ? dormant.length
              : "Not recorded",
        total: people.length,
        people: dormant.map((p) => p.person_id),
      },
    ];
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: events.filter(
        (r) => new Date(new Date(r.at).getTime() + 7200000).getUTCHours() === hour,
      ).length,
    }))
      .sort((a, b) => b.count - a.count)
      .filter((r) => r.count > 0)
      .slice(0, 3);
    return {
      type,
      metrics,
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
        label,
        count: events.filter(
          (r) => (new Date(`${sastDay(r.at)}T12:00Z`).getUTCDay() + 6) % 7 === index,
        ).length,
      })),
      hours,
      devices: ["mobile", "desktop", "unknown"].map((device) => ({
        device,
        count: events.filter((r) => r.device === device).length,
      })),
      new_devices: events.filter((r) => r.new_device).length,
    };
  });
  const attention = [
    {
      label: "People dormant 30+ days",
      people: current.dormant.map((p) => p.person_id),
      helper: loginRangeComplete(moveDay(to, -29), to)
        ? "No sign-in for at least 30 days"
        : "Sign-in history is missing for part of the last 30 days",
    },
    {
      label: "Invitations not yet accepted",
      people: ids(invitations.filter((r) => r.status === "pending" && !r.accepted_at)),
      helper: "Sent invitations still awaiting a response",
    },
    {
      label: "Registered talent with no documents",
      people: depth[0]?.people ?? [],
      helper: "A first own upload completes onboarding",
    },
    {
      label: "Agencies yet to invite a talent",
      people: unique(agencyRows.filter((a) => !a.onboarded).flatMap((a) => a.people)),
      helper: `${agencyRows.filter((a) => !a.onboarded).length} agencies have not invited talent`,
    },
  ];
  const months = trendRows(h, firstDate, to, "month").map((m) => {
    const talent = current.talent.filter(
        (p) => p.registered_at && inRange(p.registered_at, m.from, m.to),
      ),
      agencies = h.agencies.filter(
        (a) =>
          (a.status === "accepted" || a.status === "suspended") &&
          inRange(a.created_at, m.from, m.to),
      );
    return {
      month: m.label,
      talent: talent.length,
      agencies: agencies.length,
      total: talent.length + agencies.length,
      active: m.active,
      people: unique([
        ...talent.map((p) => p.person_id),
        ...h.people
          .filter((p) => p.agency_ids.some((id) => agencies.some((a) => a.id === id)))
          .map((p) => p.person_id),
      ]),
    };
  });
  const second = current.talent.filter(
    (p) => docs.filter((r) => r.own && r.validated && r.person_id === p.person_id).length >= 2,
  );
  const recentStart = moveDay(to, -27),
    recentTalent = current.talent.filter((p) => inRange(p.registered_at, recentStart, to)).length;
  const agencyTarget = h.launch?.agency_target ?? null,
    talentTarget = h.launch?.talent_target ?? null;
  const launchEnd = h.launch
    ? new Date(
        Date.UTC(
          Number(h.launch.launch_date.slice(0, 4)),
          Number(h.launch.launch_date.slice(5, 7)) - 1 + h.launch.window_months,
          Number(h.launch.launch_date.slice(8, 10)),
          12,
        ),
      )
        .toISOString()
        .slice(0, 10)
    : null;
  return {
    metrics,
    sources,
    funnels: {
      talent: funnelRows(h, to, "talent", from),
      agency: funnelRows(h, to, "agency", from),
    },
    trends: {
      week: trendRows(h, from, to, "week"),
      day: trendRows(h, from, to, "day"),
      month: trendRows(h, from, to, "month"),
    },
    cohorts,
    depth,
    documentTypes,
    agencyRows,
    activity,
    attention,
    months,
    launch: {
      settings: h.launch,
      end: launchEnd,
      talent: current.talent.length,
      agencies: agencyRows.filter((a) => a.status === "accepted" || a.status === "suspended")
        .length,
      talent_target: talentTarget,
      agency_target: agencyTarget,
      projection: launchEnd
        ? Math.round(
            current.talent.length +
              (recentTalent / 28) * Math.max(0, daysBetween(`${to}T12:00Z`, `${launchEnd}T12:00Z`)),
          )
        : null,
    },
    documents: {
      uploaded: uploads.length,
      shared: uploads.filter((r) => r.visibility === "shared").length,
      private: docs.filter((r) => r.visibility === "private").length,
      expiring: docs.filter((r) => inRange(r.expires_at, moveDay(to, 1), moveDay(to, 60))).length,
      per_active: current.active.filter((id) => current.talent.some((p) => p.person_id === id))
        .length
        ? Math.round(
            (docs.filter((r) => current.active.includes(r.person_id ?? "")).length /
              current.active.filter((id) => current.talent.some((p) => p.person_id === id))
                .length) *
              10,
          ) / 10
        : 0,
      second: second.length,
      second_people: second.map((p) => p.person_id),
    },
    contacts: {
      recipients: unique(contacts.map((r) => r.recipient_id)).length,
      shares: contacts.length,
      visits: visits.length,
      documents: contactDocs.length,
      people: ids(contacts),
      started_at: h.contact_started_at,
    },
    network: {
      linked: unique(
        h.records
          .filter((r) => r.kind === "agency_link" && r.status === "active" && !r.ended_at)
          .map((r) => r.person_id),
      ).length,
      multi: current.talent.filter((p) => p.agency_ids.length > 1).length,
      contact_talent: ids(h.records.filter((r) => r.kind === "contact_share")).length,
    },
    trust: {
      terms: ids(current.events.filter((r) => r.kind === "terms")).length,
      validated: uploads.filter((r) => r.validated).length,
      unvalidated: uploads.filter((r) => !r.validated).length,
    },
    quality: {
      undated: current.users.filter((p) => !p.registered_at).length,
      unknown_devices: current.events.filter((r) => r.kind === "sign_in" && r.device === "unknown")
        .length,
      other_currencies: current.events.filter(
        (r) => ["invoice", "quote", "payment"].includes(r.kind) && r.currency !== "ZAR",
      ).length,
    },
    billing: {
      issued: current.events.filter((r) => r.kind === "quote" || r.kind === "invoice").length,
      issued_people: ids(current.events.filter((r) => r.kind === "quote" || r.kind === "invoice")),
    },
    people: current.users.map((p) => p.person_id),
    all_document_people: ids(uploads),
    private_document_people: ids(docs.filter((r) => r.visibility === "private")),
    shared_document_people: ids(uploads.filter((r) => r.visibility === "shared")),
    expiring_document_people: ids(
      docs.filter((r) => inRange(r.expires_at, moveDay(to, 1), moveDay(to, 60))),
    ),
    contact_recipients: unique(contacts.map((r) => r.recipient_id)),
    contact_visitors: ids(visits),
    contact_document_people: ids(contactDocs),
    network_linked_people: unique(
      h.records
        .filter((r) => r.kind === "agency_link" && r.status === "active" && !r.ended_at)
        .map((r) => r.person_id),
    ),
    network_multi_people: current.talent
      .filter((p) => p.agency_ids.length > 1)
      .map((p) => p.person_id),
    terms_people: ids(current.events.filter((r) => r.kind === "terms")),
    validated_people: ids(uploads.filter((r) => r.validated)),
    unvalidated_people: ids(uploads.filter((r) => !r.validated)),
    monthly_active_people: unique(
      h.records
        .filter((r) => r.kind === "sign_in" && inRange(r.at, to.slice(0, 7) + "-01", to))
        .map((r) => r.person_id),
    ),

    total_talent: current.talent.length,
    total_users: current.users.length,
  };
}
export type Analytics = ReturnType<typeof analyseHistory>;
export const DATASETS = [
  {
    id: "people",
    label: "People",
    unit: "Person",
    includes: "Registration, onboarding, sign-ins, status",
    kinds: [],
  },
  {
    id: "invitations",
    label: "Invitations",
    unit: "Sent invitation",
    includes: "Source, sent date, response, expiry",
    kinds: ["invitation"],
  },
  {
    id: "registrations",
    label: "Registrations and onboarding",
    unit: "Milestone",
    includes: "Joining and first own upload dates",
    kinds: ["registration", "onboarding"],
  },
  {
    id: "sign_ins",
    label: "Sign-ins",
    unit: "Completed sign-in",
    includes: "Date, person, device group",
    kinds: ["sign_in"],
  },
  {
    id: "documents",
    label: "Documents",
    unit: "Document",
    includes: "Dates, type, visibility, expiry; no contents",
    kinds: ["document"],
  },
  {
    id: "shares",
    label: "Shares and trusted-contact visits",
    unit: "Share or visit",
    includes: "Access dates, successful visits, document actions",
    kinds: ["contact_share", "contact_visit", "contact_document"],
  },
  {
    id: "links",
    label: "Agency relationships",
    unit: "Relationship",
    includes: "Agency, talent, status, start and end",
    kinds: ["agency_link"],
  },
  {
    id: "billing",
    label: "Quotes, invoices and payments",
    unit: "Issued document or payment",
    includes: "Issue dates, currencies, amounts, payments",
    kinds: ["quote", "invoice", "payment"],
  },
  {
    id: "terms",
    label: "Terms acceptances",
    unit: "Acceptance",
    includes: "Person, version and acceptance date",
    kinds: ["terms"],
  },
  {
    id: "activity",
    label: "Vault and agency actions",
    unit: "Action",
    includes: "Action category and date",
    kinds: ["vault_activity", "agency_activity"],
  },
] as const;
export function datasetRows(
  h: History,
  dataset: string,
  from: string,
  to: string,
  includeEmails: boolean,
) {
  if (dataset === "people")
    return h.people.map((p) => {
      const { email, ...rest } = p;
      return includeEmails ? { ...rest, email } : rest;
    });
  const definition = DATASETS.find((d) => d.id === dataset),
    kinds: readonly string[] = definition?.kinds ?? [];
  return h.records
    .filter((r) => kinds.includes(r.kind) && inRange(r.at, from, to))
    .map((r) =>
      includeEmails
        ? { ...r, email: h.people.find((p) => p.person_id === r.person_id)?.email ?? null }
        : r,
    );
}
