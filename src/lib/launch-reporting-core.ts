/**
 * Pure aggregation rules for the Admin launch reports. Server functions load
 * rows and pass them here so every figure is computed by one tested rule.
 * Dates are bounded by South African Standard Time (UTC+2, no DST).
 */

export type LaunchSettings = {
  launch_date: string; // YYYY-MM-DD (SAST)
  window_months: number;
  talent_target: number;
  agency_target: number;
  offer_free_months: number;
  offer_talent_places: number;
  offer_agency_places: number;
};

export const LAUNCH_SETTING_KEYS: (keyof LaunchSettings)[] = [
  "launch_date",
  "window_months",
  "talent_target",
  "agency_target",
  "offer_free_months",
  "offer_talent_places",
  "offer_agency_places",
];

export function parseLaunchSettings(v: unknown): LaunchSettings | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.launch_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.launch_date)) return null;
  const nums = LAUNCH_SETTING_KEYS.filter((k) => k !== "launch_date");
  for (const k of nums) {
    if (typeof o[k] !== "number" || !Number.isInteger(o[k]) || (o[k] as number) < 0) return null;
  }
  return o as unknown as LaunchSettings;
}

/** Start of a SAST calendar day as a UTC ISO string. */
export function sastDayStart(day: string): string {
  return new Date(`${day}T00:00:00.000+02:00`).toISOString();
}
/** Last millisecond of a SAST calendar day as a UTC ISO string. */
export function sastDayEnd(day: string): string {
  return new Date(new Date(`${day}T00:00:00.000+02:00`).getTime() + 86400000 - 1).toISOString();
}
export function sastRange(from: string, to: string) {
  return { fromIso: sastDayStart(from), toIso: sastDayEnd(to) };
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const out = new Date(d);
  out.setUTCMonth(d.getUTCMonth() + months);
  // Clamp 31 Jan + 1 month to the end of February rather than rolling into March.
  if (out.getUTCDate() !== d.getUTCDate()) out.setUTCDate(0);
  return out.toISOString();
}

export function launchWindow(s: LaunchSettings) {
  const start = sastDayStart(s.launch_date);
  return { start, end: addMonths(start, s.window_months) };
}

const inWindow = (ts: string | null | undefined, a: string, b: string) => !!ts && ts >= a && ts < b;

/** True when a timestamp falls inside the launch window (what "signed up" counts). */
export function inLaunchWindow(ts: string | null | undefined, s: LaunchSettings) {
  const w = launchWindow(s);
  return inWindow(ts, w.start, w.end);
}

export function launchProgress(
  input: { talentJoined: (string | null)[]; agenciesJoined: (string | null)[] },
  s: LaunchSettings,
) {
  const w = launchWindow(s);
  const talent = input.talentJoined.filter((t) => inWindow(t, w.start, w.end)).length;
  const agencies = input.agenciesJoined.filter((t) => inWindow(t, w.start, w.end)).length;
  const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 1000) / 10 : 0);
  return {
    windowStart: w.start,
    windowEnd: w.end,
    talent,
    agencies,
    talentTarget: s.talent_target,
    agencyTarget: s.agency_target,
    talentPct: pct(talent, s.talent_target),
    agencyPct: pct(agencies, s.agency_target),
  };
}

// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------

export type InviteType = "agency" | "talent";
export type TalentSegment = "agency_linked" | "independent";
export type InviteRow = {
  id: string;
  type: InviteType;
  segment: TalentSegment | null; // talent only
  status: string; // stored status
  email: string;
  created_at: string;
  expires_at: string | null;
  first_sent_at: string | null;
  accepted_at: string | null;
  source: string | null;
  /** Belongs to a test account. */
  is_test?: boolean;
};

export const FUNNEL_BUCKETS = [
  "draft",
  "pending",
  "accepted",
  "expired",
  "revoked",
  "declined",
] as const;
export type FunnelBucket = (typeof FUNNEL_BUCKETS)[number];

export function inviteBucket(
  r: Pick<InviteRow, "status" | "expires_at">,
  nowIso: string,
): FunnelBucket {
  if (r.status === "pending" && r.expires_at && r.expires_at < nowIso) return "expired";
  return (FUNNEL_BUCKETS as readonly string[]).includes(r.status)
    ? (r.status as FunnelBucket)
    : "pending";
}

export type InviteFilter = {
  fromIso: string;
  toIso: string;
  type: InviteType | "all";
  segment: TalentSegment | "all";
};

export function matchesInviteFilter(r: InviteRow, f: InviteFilter) {
  if (r.created_at < f.fromIso || r.created_at > f.toIso) return false;
  if (f.type !== "all" && r.type !== f.type) return false;
  if (f.segment !== "all" && r.type === "talent" && r.segment !== f.segment) return false;
  if (f.segment !== "all" && r.type === "agency" && f.type === "talent") return false;
  return true;
}

export function sourceKey(s: string | null): "admin" | "agency" | "waiting_list" | "not_recorded" {
  return s === "admin" || s === "agency" || s === "waiting_list" ? s : "not_recorded";
}

/**
 * One invitation row = one invitation, however many times it was re-sent.
 * Acceptance rate = accepted / every invitation that left draft.
 */
export function invitationFunnel(rows: InviteRow[], f: InviteFilter, nowIso: string) {
  const picked = rows.filter((r) => matchesInviteFilter(r, f));
  const counts = Object.fromEntries(FUNNEL_BUCKETS.map((b) => [b, 0])) as Record<
    FunnelBucket,
    number
  >;
  const bySource: Record<string, Record<FunnelBucket, number>> = {};
  const hours: number[] = [];
  let acceptedWithoutSendTime = 0;
  for (const r of picked) {
    const b = inviteBucket(r, nowIso);
    counts[b]++;
    const sk = sourceKey(r.source);
    bySource[sk] ??= Object.fromEntries(FUNNEL_BUCKETS.map((x) => [x, 0])) as Record<
      FunnelBucket,
      number
    >;
    bySource[sk][b]++;
    if (b === "accepted") {
      if (r.first_sent_at && r.accepted_at) {
        hours.push((Date.parse(r.accepted_at) - Date.parse(r.first_sent_at)) / 3600000);
      } else acceptedWithoutSendTime++;
    }
  }
  const sent = picked.length - counts.draft;
  return {
    total: picked.length,
    counts,
    sent,
    acceptanceRate: sent > 0 ? Math.round((counts.accepted / sent) * 1000) / 10 : null,
    medianHoursToAccept: medianOf(hours),
    acceptedMeasured: hours.length,
    acceptedWithoutSendTime,
    bySource,
  };
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  return Math.round(v * 10) / 10;
}

// -----------------------------------------------------------------------------
// Launch offer
// -----------------------------------------------------------------------------

export type OfferCandidate = {
  id: string;
  type: InviteType;
  name: string;
  email: string;
  first_sent_at: string | null;
  accepted_at: string | null;
  status: string;
  is_test?: boolean;
};

/**
 * Places go to the first N invitations (per type) first sent on or after the
 * launch date, in send order. A place is "used" once that invitation is
 * accepted; the free period runs from acceptance for offer_free_months.
 * Test accounts never take a place.
 */
export function launchOffer(cands: OfferCandidate[], s: LaunchSettings) {
  const start = launchWindow(s).start;
  const build = (type: InviteType, places: number) => {
    const ordered = cands
      .filter((c) => c.type === type && !c.is_test && c.first_sent_at && c.first_sent_at >= start)
      .sort((a, b) =>
        a.first_sent_at! < b.first_sent_at!
          ? -1
          : a.first_sent_at! > b.first_sent_at!
            ? 1
            : a.id < b.id
              ? -1
              : 1,
      )
      .slice(0, places);
    const rows = ordered.map((c, i) => ({
      place: i + 1,
      ...c,
      used: c.status === "accepted" && !!c.accepted_at,
      freeUntil:
        c.status === "accepted" && c.accepted_at
          ? addMonths(c.accepted_at, s.offer_free_months)
          : null,
    }));
    return { places, allocated: rows.length, used: rows.filter((r) => r.used).length, rows };
  };
  return {
    talent: build("talent", s.offer_talent_places),
    agency: build("agency", s.offer_agency_places),
  };
}

// -----------------------------------------------------------------------------
// Terms
// -----------------------------------------------------------------------------

export type TermsPerson = {
  user_id: string;
  name: string;
  email: string;
  docType: "talent" | "agency";
  segment: TalentSegment | null;
};
export type TermsAcceptance = {
  id: string;
  user_id: string;
  document_id: string;
  doc_type: string;
  version: string;
  accepted_at: string;
  body_sha256: string | null;
  hash_retrospective: boolean | null;
};
export type CurrentDoc = { id: string; doc_type: string; version: string };

/** Who must accept which current document, and who has not yet. Admins are never in `people`. */
export function termsOutstanding(
  people: TermsPerson[],
  acc: TermsAcceptance[],
  current: CurrentDoc[],
) {
  const cur = new Map(current.map((d) => [d.doc_type, d]));
  const accepted = new Set(acc.map((a) => `${a.user_id}|${a.document_id}`));
  return people
    .filter((p) => {
      const d = cur.get(p.docType);
      return !!d && !accepted.has(`${p.user_id}|${d.id}`);
    })
    .map((p) => {
      const older = acc
        .filter((a) => a.user_id === p.user_id && a.doc_type === p.docType)
        .sort((a, b) => (a.accepted_at < b.accepted_at ? 1 : -1))[0];
      return {
        ...p,
        currentVersion: cur.get(p.docType)!.version,
        lastAcceptedVersion: older?.version ?? null,
      };
    });
}

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = c == null ? "" : String(c);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}
