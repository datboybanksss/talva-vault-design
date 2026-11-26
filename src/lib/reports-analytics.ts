import { z } from "zod";
import { ReportPerson, type ReportsPerson } from "./reports-contract";
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
/** One reported number and exactly the People-list rows behind it. */
export type Metric = {
  label: string;
  value: number | string;
  total?: number;
  people: string[];
  previous?: number;
  helper?: string;
  unit?: string;
};
export type Spend = { channel: string; month: string; amount_cents: number };
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
/**
 * Keeps a person reference only when that person is in the People list for the same filters, so
 * every figure's people are exactly the rows People shows.
 */
export function rosterOnly(h: History): History {
  const known = new Set(h.people.map((p) => p.person_id));
  return {
    ...h,
    records: h.records.map((r) => {
      const { recipient_id, ...rest } = r;
      return {
        ...rest,
        person_id: r.person_id && known.has(r.person_id) ? r.person_id : null,
        ...(recipient_id && known.has(recipient_id) ? { recipient_id } : {}),
      };
    }),
  };
}
export function periodMetrics(h: History, from: string, to: string) {
  const registered = h.people.filter(
    (p) => p.registered && (!p.registered_at || sastDay(p.registered_at) <= to),
  );
  const users = registered.filter((p) => p.account_type !== "trusted_contact");
  const userIds = new Set(users.map((p) => p.person_id));
  const talent = users.filter((p) => p.account_type === "talent");
  const events = h.records.filter((r) => inRange(r.at, from, to));
  const logins = events.filter((r) => r.kind === "sign_in" && userIds.has(r.person_id ?? ""));
  const active = ids(logins);
  const returning = active.filter(
    (id) => new Set(logins.filter((r) => r.person_id === id).map((r) => sastDay(r.at))).size >= 2,
  );
  const onboarded = talent.filter((p) => p.onboarded_at && sastDay(p.onboarded_at) <= to);
  const invitations = events.filter((r) => r.kind === "invitation" && r.type !== "connection");
  const accepted = invitations.filter((r) => r.accepted_at && sastDay(r.accepted_at) <= to);
  const dormancyKnown = loginRangeComplete(moveDay(to, -29), to);
  const dormant = users.filter((p) => {
    if (!dormancyKnown || !p.registered_at) return false;
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
      value: ids(accepted).length,
      total: ids(invitations).length,
      people: ids(accepted),
    },
    {
      label: "Dormant users",
      value: dormancyKnown ? dormant.length : "Not recorded",
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
    people: {
      active: string[];
      registrations: string[];
      documents: string[];
      sent: string[];
      accepted: string[];
    };
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
      logins = events.filter((r) => r.kind === "sign_in"),
      registrations = events.filter((r) => r.kind === "registration"),
      documents = events.filter((r) => r.kind === "document"),
      sent = events.filter((r) => r.kind === "invitation" && r.type !== "connection"),
      accepted = h.records.filter(
        (r) => r.kind === "invitation" && r.type !== "connection" && inRange(r.accepted_at, lo, hi),
      ),
      known = loginRangeComplete(lo, hi);
    rows.push({
      from: lo,
      to: hi,
      label: group === "month" ? start.slice(0, 7) : start,
      active: known ? ids(logins).length : null,
      registrations: ids(registrations).length,
      sign_ins: known ? logins.length : null,
      days_active: known
        ? unique(logins.map((r) => `${r.person_id}:${sastDay(r.at)}`)).length
        : null,
      documents: documents.length,
      sent: sent.length,
      accepted: accepted.length,
      people: {
        active: known ? ids(logins) : [],
        registrations: ids(registrations),
        documents: ids(documents),
        sent: ids(sent),
        accepted: ids(accepted),
      },
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
      !!r.person_id &&
      (type === "talent" ? r.type === "talent" || r.type === "inert" : r.type === "agency") &&
      inRange(r.at, from, to),
  );
  const accepted = invites.filter((r) => r.accepted_at && sastDay(r.accepted_at) <= to);
  const registeredIds = ids(accepted);
  const firstAgencyInvite = (agencyId: string | null | undefined) =>
    h.records
      .filter(
        (r) =>
          r.kind === "invitation" &&
          r.source === "agency" &&
          r.agency_id === agencyId &&
          sastDay(r.at) <= to,
      )
      .sort((a, b) => a.at.localeCompare(b.at))[0]?.at;
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
          .filter((i) => !!firstAgencyInvite(i.agency_id))
          .map((i) => ({ id: i.person_id ?? "", at: firstAgencyInvite(i.agency_id) ?? "" }));
  const returned = onboarded.filter(
    (p) =>
      new Set(
        h.records
          .filter((r) => r.kind === "sign_in" && r.person_id === p.id && sastDay(r.at) <= to)
          .map((r) => sastDay(r.at)),
      ).size >= 2,
  );
  const sets = [
    ids(invites),
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
  raw: History,
  from: string,
  to: string,
  prior: { from: string; to: string } | null,
  firstDate: string,
  spend: Spend[] = [],
) {
  const h = rosterOnly(raw);
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
  const cutoff = `${to}T23:59:59+02:00`;
  const talentIds = new Set(current.talent.map((p) => p.person_id));
  const staffOf = (agencyIds: string[]) =>
    current.users
      .filter(
        (p) =>
          p.account_type === "agency_staff" && p.agency_ids.some((id) => agencyIds.includes(id)),
      )
      .map((p) => p.person_id);
  const invitations = current.invitations;
  const isAccepted = (r: RecordRow) => !!r.accepted_at && sastDay(r.accepted_at) <= to;
  const sources = unique(invitations.map((r) => r.source ?? "unspecified")).map((source) => {
    const rows = invitations.filter((r) => (r.source ?? "unspecified") === source),
      accepted = rows.filter(isAccepted);
    return {
      source,
      sent: rows.length,
      accepted: accepted.length,
      rate: pct(accepted.length, rows.length),
      median: median(accepted.map((r) => daysBetween(r.at, r.accepted_at ?? r.at))),
      people: ids(rows),
      accepted_people: ids(accepted),
      statuses: ["accepted", "pending", "expired", "declined", "revoked"].map((status) => {
        const matching = rows.filter((r) =>
          status === "accepted" ? isAccepted(r) : !isAccepted(r) && r.status === status,
        );
        return { status, count: matching.length, people: ids(matching) };
      }),
    };
  });
  const docs = h.records.filter(
      (r) => r.kind === "document" && sastDay(r.at) <= to && !r.deleted_at,
    ),
    uploads = current.events.filter((r) => r.kind === "document"),
    expiring = docs.filter((r) => inRange(r.expires_at, moveDay(to, 1), moveDay(to, 60)));
  const documentTypes = unique(uploads.map((r) => r.type ?? "Unspecified")).map((type) => {
    const rows = uploads.filter((r) => (r.type ?? "Unspecified") === type);
    return {
      type,
      uploaded: rows.length,
      talent: ids(rows).length,
      shared: rows.filter((r) => r.visibility === "shared").length,
      private: rows.filter((r) => r.visibility === "private").length,
      people: ids(rows),
      shared_people: ids(rows.filter((r) => r.visibility === "shared")),
      private_people: ids(rows.filter((r) => r.visibility === "private")),
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
  const monthRows = trendRows(h, firstDate, to, "month");
  const cohorts = monthRows.map((month) => {
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
          ),
          dueIds = due.map((p) => p.person_id);
        if (!due.length)
          return {
            status: "Not yet due",
            n: 0,
            m: 0,
            percent: 0,
            people: [] as string[],
            due: dueIds,
          };
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
            due: dueIds,
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
          due: dueIds,
        };
      }),
    };
  });
  const agencyRows = h.agencies
    .map((a) => {
      const staff = staffOf([a.id]),
        links = h.records.filter(
          (r) => r.kind === "agency_link" && r.agency_id === a.id && sastDay(r.at) <= to,
        ),
        linked = ids(links),
        registered = linked.filter((id) => talentIds.has(id)),
        active = registered.filter((id) => current.active.includes(id)),
        invs = h.records.filter(
          (r) =>
            r.kind === "invitation" &&
            r.source === "agency" &&
            r.agency_id === a.id &&
            sastDay(r.at) <= to,
        ),
        agencyDocs = docs.filter((r) => r.agency_id === a.id),
        invoices = current.events.filter(
          (r) => r.kind === "invoice" && r.agency_id === a.id && r.currency === "ZAR",
        ),
        billing = current.events.filter(
          (r) => (r.kind === "invoice" || r.kind === "quote") && r.agency_id === a.id,
        );
      const latest =
        h.records
          .filter(
            (r) =>
              (r.agency_id === a.id ||
                staff.includes(r.person_id ?? "") ||
                linked.includes(r.person_id ?? "")) &&
              ["sign_in", "vault_activity", "agency_activity"].includes(r.kind) &&
              sastDay(r.at) <= to,
          )
          .sort((x, y) => y.at.localeCompare(x.at))[0]?.at ?? null;
      const age = daysBetween(a.created_at, cutoff);
      const health =
        age < 30
          ? "New"
          : registered.length > 0 && active.length >= registered.length / 2
            ? "Healthy"
            : latest && daysBetween(latest, cutoff) < 30
              ? "Needs support"
              : loginRangeComplete(moveDay(to, -29), to)
                ? "Dormant"
                : "Not recorded";
      const staffActive = staff.filter((id) => current.active.includes(id));
      return {
        ...a,
        staff: staff.length,
        staff_active: staffActive.length,
        invited: ids(invs).length,
        registered: registered.length,
        active: active.length,
        documents: agencyDocs.length,
        invoiced: invoices.reduce((s, r) => s + (r.value ?? 0), 0) / 100,
        received:
          current.events
            .filter((r) => r.kind === "payment" && r.agency_id === a.id && r.currency === "ZAR")
            .reduce((s, r) => s + (r.value ?? 0), 0) / 100,
        issued: billing.length,
        last_activity: latest,
        health,
        onboarded: invs.length > 0,
        people: unique([...staff, ...registered]),
        people_by: {
          staff,
          staff_active: staffActive,
          invited: ids(invs),
          registered,
          active,
          documents: ids(agencyDocs),
          invoiced: unique([...ids(billing), ...(billing.length ? staff : [])]),
        },
      };
    })
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  const contacts = current.events.filter((r) => r.kind === "contact_share"),
    visits = current.events.filter((r) => r.kind === "contact_visit"),
    contactDocs = current.events.filter((r) => r.kind === "contact_document");
  const activity = (["agency_staff", "talent", "trusted_contact"] as const).map((type) => {
    const people = h.people.filter(
        (p) =>
          p.account_type === type &&
          (type === "trusted_contact" || current.users.some((u) => u.person_id === p.person_id)),
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
        people: type === "trusted_contact" ? [] : dormant.map((p) => p.person_id),
      },
    ];
    const hourOf = (r: RecordRow) => new Date(new Date(r.at).getTime() + 7200000).getUTCHours();
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const rows = events.filter((r) => hourOf(r) === hour);
      return { hour, count: rows.length, people: ids(rows) };
    })
      .sort((a, b) => b.count - a.count)
      .filter((r) => r.count > 0)
      .slice(0, 3);
    return {
      type,
      metrics,
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
        const rows = events.filter(
          (r) => (new Date(`${sastDay(r.at)}T12:00Z`).getUTCDay() + 6) % 7 === index,
        );
        return { label, count: rows.length, people: ids(rows) };
      }),
      hours,
      devices: ["mobile", "desktop", "unknown"].map((device) => {
        const rows = events.filter((r) => r.device === device);
        return { device, count: rows.length, people: ids(rows) };
      }),
      new_devices: events.filter((r) => r.new_device).length,
      new_device_people: ids(events.filter((r) => r.new_device)),
    };
  });
  const notOnboarded = agencyRows.filter((a) => !a.onboarded);
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
      people: unique(notOnboarded.flatMap((a) => a.people)),
      helper: `in ${notOnboarded.length} agencies that have not invited talent`,
    },
  ];
  const joinedAgencies = agencyRows.filter(
    (a) => a.status === "accepted" || a.status === "suspended",
  );
  const months = monthRows.map((m) => {
    const talent = current.talent.filter(
        (p) => p.registered_at && inRange(p.registered_at, m.from, m.to),
      ),
      agencies = joinedAgencies.filter((a) => inRange(a.created_at, m.from, m.to)),
      talentPeople = talent.map((p) => p.person_id),
      agencyPeople = staffOf(agencies.map((a) => a.id));
    return {
      month: m.label,
      talent: talent.length,
      agencies: agencies.length,
      total: talent.length + agencies.length,
      active: m.active,
      invitations_sent: m.sent,
      invitations_accepted: m.accepted,
      documents: m.documents,
      talent_people: talentPeople,
      agency_people: agencyPeople,
      active_people: m.people.active,
      people: unique([...talentPeople, ...agencyPeople]),
    };
  });
  const second = current.talent.filter(
    (p) => docs.filter((r) => r.own && r.validated && r.person_id === p.person_id).length >= 2,
  );
  const recentStart = moveDay(to, -27),
    recentTalent = current.talent.filter((p) => inRange(p.registered_at, recentStart, to)).length;
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
  const talentPeople = current.talent.map((p) => p.person_id),
    agencyStaff = staffOf(joinedAgencies.map((a) => a.id)),
    activeTalent = current.active.filter((id) => talentIds.has(id)),
    activeTalentDocs = docs.filter((r) => activeTalent.includes(r.person_id ?? "")),
    linkedPeople = ids(
      h.records.filter(
        (r) =>
          r.kind === "agency_link" &&
          r.status === "active" &&
          !r.ended_at &&
          talentIds.has(r.person_id ?? ""),
      ),
    ),
    multiPeople = current.talent.filter((p) => p.agency_ids.length > 1).map((p) => p.person_id),
    sharingTalent = ids(
      h.records.filter(
        (r) =>
          r.kind === "contact_share" && sastDay(r.at) <= to && talentIds.has(r.person_id ?? ""),
      ),
    ),
    onboardedPeople = current.onboarded.map((p) => p.person_id),
    termsPeople = ids(current.events.filter((r) => r.kind === "terms")).filter((id) =>
      current.users.some((p) => p.person_id === id),
    ),
    monthlyActive = ids(
      h.records.filter((r) => r.kind === "sign_in" && inRange(r.at, to.slice(0, 7) + "-01", to)),
    ).filter((id) => current.users.some((p) => p.person_id === id)),
    billing = current.events.filter((r) => r.kind === "quote" || r.kind === "invoice"),
    receivedZar =
      current.events
        .filter((r) => r.kind === "payment" && r.currency === "ZAR")
        .reduce((s, r) => s + (r.value ?? 0), 0) / 100,
    onboardedAgencies = agencyRows.filter((a) => a.onboarded),
    agenciesWithActive = agencyRows.filter((a) => a.active > 0),
    registeredViaAgencies = unique(agencyRows.flatMap((a) => a.people_by.registered)),
    undated = current.users.filter((p) => !p.registered_at).map((p) => p.person_id),
    unknownDevices = current.events.filter((r) => r.kind === "sign_in" && r.device === "unknown"),
    otherCurrency = current.events.filter(
      (r) => ["invoice", "quote", "payment"].includes(r.kind) && r.currency !== "ZAR",
    ),
    last = months.at(-1),
    before = months.at(-2),
    growth = before?.total ? pct((last?.total ?? 0) - before.total, before.total) : null;
  const periodMonths = new Set(trendRows(h, from, to, "month").map((m) => m.label));
  const periodSpend = spend.filter((s) => periodMonths.has(s.month));
  const acquisition = unique([
    ...sources.map((s) => s.source),
    ...periodSpend.map((s) => s.channel),
  ]).map((channel) => {
    const source = sources.find((s) => s.source === channel),
      registered = source?.accepted_people ?? [],
      rows = periodSpend.filter((s) => s.channel === channel),
      cents = rows.reduce((n, s) => n + s.amount_cents, 0);
    return {
      channel,
      registered: registered.length,
      people: registered,
      spend: rows.length ? cents / 100 : null,
      cost: rows.length && registered.length ? Math.round(cents / registered.length) / 100 : null,
    };
  });
  const figures = {
    launch: [
      {
        label: "Talent",
        value: talentPeople.length,
        ...(h.launch ? { total: h.launch.talent_target } : {}),
        people: talentPeople,
      },
      {
        label: "Agencies",
        value: joinedAgencies.length,
        ...(h.launch ? { total: h.launch.agency_target } : {}),
        people: agencyStaff,
      },
    ],
    depth: [
      {
        label: "Documents per active talent",
        value: activeTalent.length
          ? Math.round((activeTalentDocs.length / activeTalent.length) * 10) / 10
          : 0,
        people: activeTalent,
        helper: `${activeTalentDocs.length} documents across ${activeTalent.length} active talent`,
      },
      {
        label: "Uploaded a second document",
        value: second.length,
        total: current.talent.length,
        people: second.map((p) => p.person_id),
      },
    ],
    documents: [
      { label: "Uploaded", value: uploads.length, people: ids(uploads) },
      {
        label: "Shared with an agency",
        value: uploads.filter((r) => r.visibility === "shared").length,
        total: uploads.length,
        people: ids(uploads.filter((r) => r.visibility === "shared")),
      },
      {
        label: "Kept in private vaults",
        value: docs.filter((r) => r.visibility === "private").length,
        people: ids(docs.filter((r) => r.visibility === "private")),
      },
      { label: "Expiring in the next 60 days", value: expiring.length, people: ids(expiring) },
    ],
    contacts: [
      {
        label: "Recipients given access",
        value: unique(contacts.map((r) => r.recipient_id)).length,
        people: unique(contacts.map((r) => r.recipient_id)),
      },
      { label: "Shares created", value: contacts.length, people: ids(contacts) },
      { label: "Visits", value: visits.length, people: ids(visits) },
      {
        label: "Documents opened or downloaded",
        value: contactDocs.length,
        people: ids(contactDocs),
      },
    ],
    agencies: [
      {
        label: "Agencies onboarded vs target",
        value: onboardedAgencies.length,
        ...(h.launch ? { total: h.launch.agency_target } : {}),
        people: unique(onboardedAgencies.flatMap((a) => a.people)),
      },
      {
        label: "Agencies with active talent",
        value: agenciesWithActive.length,
        total: agencyRows.length,
        people: unique(agenciesWithActive.flatMap((a) => a.people)),
      },
      {
        label: "Talent per agency",
        value: agencyRows.length
          ? Math.round(
              (agencyRows.reduce((n, a) => n + a.registered, 0) / agencyRows.length) * 10,
            ) / 10
          : 0,
        people: registeredViaAgencies,
        helper: `${registeredViaAgencies.length} registered talent across ${agencyRows.length} agencies`,
      },
      {
        label: "Quotes and invoices issued",
        value: billing.length,
        people: unique(agencyRows.flatMap((a) => a.people_by.invoiced)),
        helper: `R ${receivedZar.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} received`,
      },
    ],
    business: [
      {
        label: "Accounts on TalVault",
        value: talentPeople.length + joinedAgencies.length,
        people: unique([...talentPeople, ...agencyStaff]),
        helper: `${talentPeople.length} talent plus ${joinedAgencies.length} registered agencies`,
      },
      {
        label: "Month-on-month growth",
        value: growth ?? "Not available",
        unit: growth === null ? "" : "%",
        people: growth === null ? [] : (last?.people ?? []),
        helper:
          growth === null
            ? "No new accounts in the previous month"
            : `${last?.total ?? 0} new accounts this month, ${before?.total ?? 0} the month before`,
      },
      {
        label: "Monthly active share",
        value: pct(monthlyActive.length, current.users.length),
        unit: "%",
        total: current.users.length,
        people: monthlyActive,
        helper: `${monthlyActive.length} of ${current.users.length} · ${pct(monthlyActive.length, current.users.length)}%`,
      },
    ],
    network: [
      {
        label: "Talent linked to agencies",
        value: linkedPeople.length,
        total: current.talent.length,
        people: linkedPeople,
      },
      {
        label: "Talent with multiple agencies",
        value: multiPeople.length,
        total: current.talent.length,
        people: multiPeople,
      },
      {
        label: "Talent sharing with trusted contacts",
        value: sharingTalent.length,
        total: current.talent.length,
        people: sharingTalent,
      },
    ],
    adoption: [
      { label: "Own document upload", value: onboardedPeople.length, people: onboardedPeople },
      { label: "Agency connections", value: linkedPeople.length, people: linkedPeople },
      { label: "Trusted-contact sharing", value: sharingTalent.length, people: sharingTalent },
      {
        label: "Second document upload",
        value: second.length,
        people: second.map((p) => p.person_id),
      },
    ].map((f) => ({ ...f, total: current.talent.length })),
    trust: [
      {
        label: "Terms accepted",
        value: termsPeople.length,
        total: current.users.length,
        people: termsPeople,
      },
      {
        label: "Validated uploads",
        value: uploads.filter((r) => r.validated).length,
        total: uploads.length,
        people: ids(uploads.filter((r) => r.validated)),
      },
      {
        label: "Uploads awaiting validation",
        value: uploads.filter((r) => !r.validated).length,
        total: uploads.length,
        people: ids(uploads.filter((r) => !r.validated)),
      },
    ],
    quality: [
      { label: "People with no joining date", value: undated.length, people: undated },
      {
        label: "Sign-ins with no device information",
        value: unknownDevices.length,
        people: ids(unknownDevices),
      },
      {
        label: "Billing records in other currencies",
        value: otherCurrency.length,
        people: staffOf(unique(otherCurrency.map((r) => r.agency_id))),
      },
    ],
  } satisfies Record<string, Metric[]>;
  return {
    metrics,
    sources,
    funnels: {
      talent: funnelRows(h, to, "talent", from),
      agency: funnelRows(h, to, "agency", from),
    },
    funnel_unlisted: invitations.filter((r) => !r.person_id).length,
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
    acquisition,
    spend,
    figures,
    launch: {
      settings: h.launch,
      end: launchEnd,
      projection: launchEnd
        ? Math.round(
            current.talent.length +
              (recentTalent / 28) * Math.max(0, daysBetween(`${to}T12:00Z`, `${launchEnd}T12:00Z`)),
          )
        : null,
    },
    contacts_started_at: h.contact_started_at,
    period: { from, to, first: firstDate },
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
const CHANNELS: Record<string, string> = {
  admin: "Admin invitation",
  agency: "Agency invitation",
  waiting_list: "Waiting list",
  launch_signup_sheet: "Launch sign-up sheet",
  unspecified: "Source not recorded",
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);
export const channelLabel = (key: string) => CHANNELS[key] ?? key.replaceAll("_", " ");
const HEADINGS: Record<string, string> = {
  person_id: "Person ID",
  record_id: "Record ID",
  invoiced_zar: "Invoiced (R)",
  received_zar: "Received (R)",
  spend_zar: "Spend (R)",
  cost_per_registration_zar: "Cost per registration (R)",
};
/** Column headings for downloads, in plain words. */
export const columnHeading = (key: string) =>
  HEADINGS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1)).replaceAll("_", " ");
/** Every report section with its own download. Labels are the section titles on screen. */
export const SECTIONS = {
  overview_kpis: "Overview key figures",
  overview_trend: "Weekly trend",
  overview_funnel: "Talent onboarding",
  overview_attention: "Needs attention",
  growth_launch: "Launch progress",
  growth_sources: "Where invitations come from",
  growth_funnel: "Onboarding funnel",
  growth_weekly: "Registrations and invitations by week",
  engagement_activity: "Sign-in activity",
  engagement_retention: "Retention by joining month",
  engagement_depth: "Vault depth",
  engagement_documents: "Documents",
  engagement_contacts: "Trusted contacts",
  agencies_performance: "Agency performance",
  business_revenue: "Revenue",
  business_discount: "Launch discount",
  business_months: "Growth by month",
  business_network: "Network effect",
  business_acquisition: "Acquisition cost by channel",
  business_adoption: "Feature adoption",
  business_trust: "Trust and security",
  business_quality: "Data quality",
} as const;
export type SectionId = keyof typeof SECTIONS;
export const SECTION_IDS = Object.keys(SECTIONS).filter((id): id is SectionId => id in SECTIONS);
const ACCOUNT_LABEL = {
  agency_staff: "Agency staff",
  talent: "Talent",
  trusted_contact: "Trusted contact",
};
/**
 * The records behind one section, for its "Download CSV". Never includes email addresses: the
 * person columns are built from an explicit list.
 */
export function sectionRows(raw: History, a: Analytics, section: SectionId): object[] {
  return sectionRecords(raw, a, section).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [columnHeading(key), value])),
  );
}
function sectionRecords(raw: History, a: Analytics, section: SectionId): object[] {
  const h = rosterOnly(raw),
    { from, to } = a.period,
    byId = new Map<string, ReportsPerson>(h.people.map((p) => [p.person_id, p])),
    agencyName = new Map(h.agencies.map((x) => [x.id, x.name]));
  const person = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : undefined;
    return {
      person_id: p?.person_id ?? "",
      name: p?.name ?? "",
      account_type: p ? ACCOUNT_LABEL[p.account_type] : "",
      agencies: p
        ? p.agency_names.join("; ") || (p.account_type === "talent" ? "Independent" : "")
        : "",
      status: p?.status ?? "",
      joined: p?.registered_at ?? "",
    };
  };
  const figureRows = (figures: Metric[], group = "") =>
    figures.flatMap((f) => {
      const base = {
        ...(group ? { group } : {}),
        figure: f.label,
        value: `${f.value}${f.unit ?? ""}`,
        out_of: f.total ?? "",
      };
      return f.people.length
        ? f.people.map((id) => ({ ...base, ...person(id) }))
        : [{ ...base, ...person(null) }];
    });
  const record = (r: RecordRow) => ({
    record_id: r.id,
    record: r.kind.replaceAll("_", " "),
    date: r.at,
    type: r.type ?? "",
    source: r.kind === "invitation" ? channelLabel(r.source ?? "unspecified") : (r.source ?? ""),
    record_status: r.status ?? "",
    accepted: r.accepted_at ?? "",
    expires: r.expires_at ?? "",
    visibility: r.visibility ?? "",
    validated: r.validated === undefined ? "" : r.validated ? "Yes" : "No",
    agency: r.agency_id ? (agencyName.get(r.agency_id) ?? "") : "",
    ...person(r.person_id),
  });
  const periodRecords = (kinds: string[]) =>
    h.records.filter((r) => kinds.includes(r.kind) && inRange(r.at, from, to)).map(record);
  const trend = (rows: Analytics["trends"]["week"]) =>
    rows.map((r) => ({
      from: r.from,
      to: r.to,
      active_users: r.active ?? "Not recorded",
      sign_ins: r.sign_ins ?? "Not recorded",
      days_active: r.days_active ?? "Not recorded",
      registrations: r.registrations,
      documents_uploaded: r.documents,
      invitations_sent: r.sent,
      invitations_accepted: r.accepted,
    }));
  const funnel = (group: string, rows: Analytics["funnels"]["talent"]) =>
    unique(rows.flatMap((r) => r.people)).map((id) => ({
      funnel: group,
      ...person(id),
      ...Object.fromEntries(
        rows.map((r) => [
          r.label
            .toLowerCase()
            .replace(/[^a-z]+/g, "_")
            .replace(/_$/, ""),
          r.people.includes(id) ? "Yes" : "No",
        ]),
      ),
    }));
  switch (section) {
    case "overview_kpis":
      return figureRows(a.metrics);
    case "overview_trend":
      return trend(a.trends.week);
    case "overview_funnel":
      return funnel("Talent", a.funnels.talent);
    case "overview_attention":
      return figureRows(
        a.attention.map((r) => ({ label: r.label, value: r.people.length, people: r.people })),
      );
    case "growth_launch":
      return figureRows(a.figures.launch);
    case "growth_sources":
      return h.records
        .filter(
          (r) => r.kind === "invitation" && r.type !== "connection" && inRange(r.at, from, to),
        )
        .map(record);
    case "growth_funnel":
      return [...funnel("Talent", a.funnels.talent), ...funnel("Agencies", a.funnels.agency)];
    case "growth_weekly":
      return trend(a.trends.week);
    case "engagement_activity":
      return a.activity.flatMap((g) => figureRows(g.metrics, ACCOUNT_LABEL[g.type]));
    case "engagement_retention":
      return a.cohorts.flatMap((c) =>
        c.people.map((id) => ({
          joining_month: c.month,
          ...person(id),
          ...Object.fromEntries(
            c.cells.map((cell, i) => [
              `day_${[30, 60, 90][i]}`,
              !cell.due.includes(id)
                ? "Not yet due"
                : cell.status !== "known"
                  ? cell.status
                  : cell.people.includes(id)
                    ? "Signed in"
                    : "Did not sign in",
            ]),
          ),
        })),
      );
    case "engagement_depth":
      return [
        ...a.depth.flatMap((d) =>
          figureRows([{ label: d.label, value: d.count, total: d.total, people: d.people }]),
        ),
        ...figureRows(a.figures.depth),
      ];
    case "engagement_documents":
      return periodRecords(["document"]);
    case "engagement_contacts":
      return periodRecords(["contact_share", "contact_visit", "contact_document"]);
    case "agencies_performance":
      return a.agencyRows.map((r) => ({
        agency: r.name,
        status: r.status,
        joined: r.created_at,
        staff: r.staff,
        staff_active: r.staff_active,
        talent_invited: r.invited,
        registered_talent: r.registered,
        active_talent: r.active,
        documents: r.documents,
        quotes_and_invoices_issued: r.issued,
        invoiced_zar: r.invoiced,
        received_zar: r.received,
        last_activity: r.last_activity ?? "",
        health: r.health,
      }));
    case "business_revenue":
      return [
        { figure: "Paying accounts", value: 0, note: "Paid plans start in 2027" },
        ...periodRecords(["quote", "invoice", "payment"]).map((r) => ({
          figure: "Agency billing record",
          value: "",
          note: "",
          ...r,
        })),
      ];
    case "business_discount":
      return [
        {
          figure: "Launch discount",
          value: "Awaiting the verified launch sign-up sheet",
        },
      ];
    case "business_months":
      return a.months.map((m) => ({
        month: m.month,
        new_talent: m.talent,
        new_agencies: m.agencies,
        new_accounts: m.total,
        active_users: m.active ?? "Not recorded",
        invitations_sent: m.invitations_sent,
        invitations_accepted: m.invitations_accepted,
        documents_uploaded: m.documents,
      }));
    case "business_network":
      return figureRows(a.figures.network);
    case "business_acquisition":
      return [
        ...a.acquisition.map((r) => ({
          row: "Channel total for the period",
          channel: channelLabel(r.channel),
          month: "",
          registered: r.registered,
          spend_zar: r.spend ?? "Not supplied",
          cost_per_registration_zar: r.cost ?? "Not available",
        })),
        ...a.spend.map((s) => ({
          row: "Monthly spend entry",
          channel: channelLabel(s.channel),
          month: s.month,
          registered: "",
          spend_zar: s.amount_cents / 100,
          cost_per_registration_zar: "",
        })),
      ];
    case "business_adoption":
      return figureRows(a.figures.adoption);
    case "business_trust":
      return figureRows(a.figures.trust);
    case "business_quality":
      return figureRows(a.figures.quality);
  }
}
