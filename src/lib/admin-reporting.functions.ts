import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
import {
  accountStatusCounts,
  agencyAccountStatus,
  talentAccountStatus,
} from "@/lib/account-filters";
import { SHARE_RECIPIENT_TERM_CAPITALISED } from "@/lib/terms";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { fetchOnboardedTalent, fetchTalentSplit } from "@/lib/onboarded-talent";
import {
  buildTestScope,
  daysToAccept,
  inviteFunnel,
  sentAt,
  sentInPeriod,
  type AccountScope,
  type TestScope,
} from "@/lib/report-scope";

// Mirrors the canonical actions in talent-activity.server.ts; kept local so this
// client-reachable module never pulls a server-only file into the browser graph.
const TALENT_LOGIN_ACTION = "login";
const TALENT_VAULT_ACTIONS = [
  "vault_document_uploaded",
  "vault_document_moved",
  "vault_document_deleted",
  "vault_folder_created",
  "vault_document_shared",
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

const PeriodInput = z.object({
  accounts: z.enum(["real", "test", "all"]).default("real"),
  from: z
    .string()
    .max(10000)
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z
    .string()
    .max(10000)
    .regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Period = { fromIso: string; toIso: string; from: string; to: string };

function toPeriod(from: string, to: string): Period {
  return {
    from,
    to,
    fromIso: new Date(`${from}T00:00:00.000Z`).toISOString(),
    toIso: new Date(`${to}T23:59:59.999Z`).toISOString(),
  };
}

/** The window of equal length immediately before the selected one. */
function priorPeriod(p: Period): Period {
  const start = new Date(p.fromIso).getTime();
  const end = new Date(p.toIso).getTime();
  const span = end - start;
  const priorEnd = new Date(start - 1);
  const priorStart = new Date(start - 1 - span);
  return {
    from: priorStart.toISOString().slice(0, 10),
    to: priorEnd.toISOString().slice(0, 10),
    fromIso: priorStart.toISOString(),
    toIso: priorEnd.toISOString(),
  };
}

const ACTIVITY_ACTIONS = [TALENT_LOGIN_ACTION, ...TALENT_VAULT_ACTIONS];

/** Every activity row in a window, keyed by the talent who generated it. */
async function activityRows(admin: SupabaseClient<Database>, fromIso: string, toIso: string) {
  const { data, error } = await admin
    .from("talent_audit_log")
    .select("actor_id, action, created_at")
    .in("action", ACTIVITY_ACTIONS)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (error) throw databaseError(error);
  return (data ?? []) as { actor_id: string; action: string; created_at: string }[];
}

/**
 * Onboarded talent — shared definition with the Admin Overview dashboard.
 * See src/lib/onboarded-talent.ts.
 */
async function onboardedTalent(
  admin: SupabaseClient<Database>,
  toIso: string,
  scope: AccountScope = "real",
) {
  return await fetchOnboardedTalent(admin, toIso, scope);
}

/** Everything needed to decide whether a row belongs to a test account. */
async function loadTestScope(
  admin: SupabaseClient<Database>,
  scope: AccountScope,
): Promise<TestScope> {
  const [ag, ta, mem] = await Promise.all([
    admin.from("agencies").select("id, is_test, contact_email, main_contact_email"),
    admin.from("talent_profiles").select("id, user_id, email, is_test"),
    admin.from("agency_members").select("user_id, agency_id"),
  ]);
  if (ag.error) throw databaseError(ag.error);
  if (ta.error) throw databaseError(ta.error);
  if (mem.error) throw databaseError(mem.error);
  const testAgencyIds = new Set((ag.data ?? []).filter((a) => a.is_test).map((a) => a.id));
  const memberIds = [
    ...new Set(
      (mem.data ?? []).filter((m) => testAgencyIds.has(m.agency_id)).map((m) => m.user_id),
    ),
  ];
  let memberEmails: (string | null)[] = [];
  if (memberIds.length > 0) {
    const { data, error } = await admin.from("profiles").select("email").in("id", memberIds);
    if (error) throw databaseError(error);
    memberEmails = (data ?? []).map((p) => p.email);
  }
  return buildTestScope(
    { agencies: ag.data ?? [], talent: ta.data ?? [], testAgencyMemberEmails: memberEmails },
    scope,
  );
}

type InviteFunnelRow = {
  id: string;
  kind: "agency" | "talent_admin" | "talent_agency" | "connection_request";
  name: string;
  email: string;
  agency_id: string | null;
  status: string;
  created_at: string;
  first_sent_at: string | null;
  accepted_at: string | null;
  /** Connection requests only: accepted / declined / pending / cancelled. */
  state?: string;
};

/**
 * Every agency and talent invitation in scope, plus connection requests to
 * existing independent talent (kept separate from invitations). Inert agency
 * talent invitations (never acceptable) are left out.
 */
async function loadInviteFunnelRows(
  admin: SupabaseClient<Database>,
  ts: TestScope,
): Promise<InviteFunnelRow[]> {
  const [ag, ind, tal, priv, legacy] = await Promise.all([
    admin
      .from("agency_invitations")
      .select("id, agency_id, agency_name, email, status, created_at, first_sent_at, accepted_at")
      .eq("kind", "agency_onboarding"),
    admin
      .from("independent_talent_invitations")
      .select("id, talent_name, email, status, created_at, first_sent_at, accepted_at"),
    admin
      .from("talent_invitations")
      .select("id, agency_id, talent_name, email, status, created_at, first_sent_at, accepted_at"),
    admin.from("talent_invite_private").select("invitation_id, kind, state, requested_at"),
    admin
      .from("agency_talent_links")
      .select("talent_invitation_id, status, declined_at")
      .eq("request_kind", "link_request")
      .not("talent_invitation_id", "is", null),
  ]);
  for (const r of [ag, ind, tal, priv, legacy]) if (r.error) throw databaseError(r.error);
  const inert = new Set(
    (priv.data ?? []).filter((p) => p.kind === "inert").map((p) => p.invitation_id),
  );
  const requests = new Map<string, string>();
  for (const p of priv.data ?? [])
    if (p.kind === "link_request") requests.set(p.invitation_id, p.state);
  for (const l of legacy.data ?? []) {
    const id = l.talent_invitation_id as string;
    if (!requests.has(id)) {
      requests.set(
        id,
        l.status === "active"
          ? "accepted"
          : l.declined_at
            ? "declined"
            : l.status === "invited"
              ? "pending"
              : "cancelled",
      );
    }
  }
  const rows: InviteFunnelRow[] = [
    ...(ag.data ?? []).map((r) => ({
      id: r.id,
      kind: "agency" as const,
      name: r.agency_name,
      email: r.email,
      agency_id: r.agency_id,
      status: String(r.status),
      created_at: r.created_at,
      first_sent_at: r.first_sent_at,
      accepted_at: r.accepted_at,
    })),
    ...(ind.data ?? []).map((r) => ({
      id: r.id,
      kind: "talent_admin" as const,
      name: r.talent_name,
      email: r.email,
      agency_id: null,
      status: String(r.status),
      created_at: r.created_at,
      first_sent_at: r.first_sent_at,
      accepted_at: r.accepted_at,
    })),
    ...(tal.data ?? [])
      .filter((r) => !inert.has(r.id))
      .map((r) => ({
        id: r.id,
        kind: requests.has(r.id) ? ("connection_request" as const) : ("talent_agency" as const),
        name: r.talent_name,
        email: r.email,
        agency_id: r.agency_id,
        status: String(r.status),
        created_at: r.created_at,
        first_sent_at: r.first_sent_at,
        accepted_at: r.accepted_at,
        state: requests.get(r.id),
      })),
  ];
  return rows.filter((r) => ts.keep(ts.inviteIsTest(r)));
}

function funnelSummaries(rows: InviteFunnelRow[], fromIso: string, toIso: string) {
  const of = (k: InviteFunnelRow["kind"]) => rows.filter((r) => r.kind === k);
  const talentRows = [...of("talent_admin"), ...of("talent_agency")];
  const requests = of("connection_request").filter((r) => sentInPeriod(r, fromIso, toIso));
  return {
    agency: inviteFunnel(of("agency"), fromIso, toIso),
    talent: {
      ...inviteFunnel(talentRows, fromIso, toIso),
      byAdmin: inviteFunnel(of("talent_admin"), fromIso, toIso),
      byAgencies: inviteFunnel(of("talent_agency"), fromIso, toIso),
      connectionRequests: {
        sent: requests.length,
        accepted: requests.filter((r) => r.state === "accepted" || r.accepted_at).length,
        declined: requests.filter((r) => r.state === "declined" || r.status === "declined").length,
      },
    },
  };
}

// -----------------------------------------------------------------------------
// North star — two-sided engagement per agency/talent relationship
// -----------------------------------------------------------------------------
//
// A relationship counts as engaged in a period when BOTH sides acted:
//   talent side  — a sign-in or any vault action (talent_audit_log)
//   agency side  — an action attributable to that specific talent:
//                  viewing their shared vault, a document action on one of
//                  their documents, a document request, or an invitation action
//
// Quotes and invoices are deliberately excluded: they only carry a typed-in
// client/talent name today and cannot be tied to a talent link reliably.

export type NorthStarPair = {
  linkId: string;
  agencyId: string;
  talentName: string;
  talentActions: string[];
  agencyActions: string[];
  both: boolean;
};

export async function northStarPairs(
  admin: SupabaseClient<Database>,
  period: { fromIso: string; toIso: string },
  ts?: TestScope,
): Promise<NorthStarPair[]> {
  // Denominator: every live (non-revoked) relationship that existed by the end
  // of the period.
  const { data: links, error: linkErr } = await admin
    .from("agency_talent_links")
    .select("id, agency_id, talent_user_id, talent_invitation_id, display_name, created_at")
    .neq("status", "revoked")
    .lte("created_at", period.toIso);
  if (linkErr) throw databaseError(linkErr);
  // Inert invitations (can never be accepted) are not real relationships.
  const { data: inert, error: inertError } = await admin
    .from("talent_invite_private")
    .select("invitation_id")
    .eq("kind", "inert");
  if (inertError) throw databaseError(inertError);
  const inertIds = new Set((inert ?? []).map((r) => r.invitation_id));
  const live = (links ?? []).filter(
    (l) =>
      (!l.talent_invitation_id || !inertIds.has(l.talent_invitation_id)) &&
      // A relationship is test data when either side is a test account.
      (!ts || ts.keep(ts.agencyIsTest(l.agency_id) || ts.talentUserIsTest(l.talent_user_id))),
  );
  if (live.length === 0) return [];

  const byId = new Map<string, NorthStarPair>();
  const byTalentUser = new Map<string, string[]>();
  const byInvitation = new Map<string, string>();
  for (const l of live) {
    byId.set(l.id, {
      linkId: l.id,
      agencyId: l.agency_id,
      talentName: l.display_name,
      talentActions: [],
      agencyActions: [],
      both: false,
    });
    if (l.talent_user_id) {
      byTalentUser.set(l.talent_user_id, [...(byTalentUser.get(l.talent_user_id) ?? []), l.id]);
    }
    if (l.talent_invitation_id) byInvitation.set(l.talent_invitation_id, l.id);
  }

  const addTalent = (linkId: string, action: string) => {
    const p = byId.get(linkId);
    if (p && !p.talentActions.includes(action)) p.talentActions.push(action);
  };
  const addAgency = (linkId: string, action: string) => {
    const p = byId.get(linkId);
    if (p && !p.agencyActions.includes(action)) p.agencyActions.push(action);
  };

  // ---- Talent side ----------------------------------------------------------
  const talentRows = await activityRows(admin, period.fromIso, period.toIso);
  for (const r of talentRows) {
    for (const linkId of byTalentUser.get(r.actor_id) ?? []) addTalent(linkId, r.action);
  }

  // ---- Agency side ----------------------------------------------------------
  const { data: agencyRows, error: agErr } = await admin
    .from("agency_audit_log")
    .select("agency_id, action, target_type, target_id")
    .gte("created_at", period.fromIso)
    .lte("created_at", period.toIso);
  if (agErr) throw databaseError(agErr);

  const docIds = [
    ...new Set(
      (agencyRows ?? [])
        .filter((r) => r.target_type === "document" && r.target_id)
        .map((r) => r.target_id as string),
    ),
  ];
  const docToLink = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs, error: docsError } = await admin
      .from("talent_shared_documents")
      .select("id, talent_link_id")
      .in("id", docIds);
    if (docsError) throw databaseError(docsError);
    for (const d of docs ?? []) if (d.talent_link_id) docToLink.set(d.id, d.talent_link_id);
  }

  for (const r of agencyRows ?? []) {
    if (!r.target_id) continue;
    if (r.target_type === "talent_link") addAgency(r.target_id, r.action);
    else if (r.target_type === "document") {
      const linkId = docToLink.get(r.target_id);
      if (linkId) addAgency(linkId, r.action);
    } else if (r.target_type === "talent_invitation") {
      const linkId = byInvitation.get(r.target_id);
      if (linkId) addAgency(linkId, r.action);
    }
  }

  // Document requests are stored against a talent link directly rather than
  // written to the audit log, so they are counted from their own table.
  const { data: requests, error: requestsError } = await admin
    .from("agency_document_requests")
    .select("talent_link_id, created_at, reviewed_at")
    .lte("created_at", period.toIso);
  if (requestsError) throw databaseError(requestsError);
  for (const r of requests ?? []) {
    if (!r.talent_link_id) continue;
    const inWindow = (ts: string | null) => !!ts && ts >= period.fromIso && ts <= period.toIso;
    if (inWindow(r.created_at)) addAgency(r.talent_link_id, "document_request_created");
    if (inWindow(r.reviewed_at)) addAgency(r.talent_link_id, "document_request_reviewed");
  }

  const pairs = [...byId.values()];
  for (const p of pairs) p.both = p.talentActions.length > 0 && p.agencyActions.length > 0;
  return pairs;
}

function activeSets(rows: { actor_id: string; action: string }[]) {
  const logins = new Set<string>();
  const vault = new Set<string>();
  const any = new Set<string>();
  for (const r of rows) {
    any.add(r.actor_id);
    if (r.action === TALENT_LOGIN_ACTION) logins.add(r.actor_id);
    else vault.add(r.actor_id);
  }
  return { logins, vault, any };
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

const sumCents = (
  rows: { amount_cents?: number | null; total_cents?: number | null }[],
  key: "amount_cents" | "total_cents",
) => rows.reduce((n: number, r) => n + Number(r[key] ?? 0), 0);

export const getReportingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PeriodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const period = toPeriod(data.from, data.to);
    const prior = priorPeriod(period);
    const scope = data.accounts;
    const ts = await loadTestScope(admin, scope);
    const keepTalent = (id: string | null | undefined) => ts.keep(ts.talentUserIsTest(id));
    const keepAgency = (id: string | null | undefined) => ts.keep(ts.agencyIsTest(id));

    // ---- Activity tracking (north star + engagement) -------------------------
    const { data: firstActivity } = await admin
      .from("talent_audit_log")
      .select("created_at")
      .in("action", ACTIVITY_ACTIONS)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const trackingSince: string | null = firstActivity?.created_at ?? null;

    const [rowsNow, rowsPrior, talentNow, talentPrior, talentSplit] = await Promise.all([
      activityRows(admin, period.fromIso, period.toIso),
      activityRows(admin, prior.fromIso, prior.toIso),
      onboardedTalent(admin, period.toIso, scope),
      onboardedTalent(admin, prior.toIso, scope),
      fetchTalentSplit(admin, period.toIso, scope),
    ]);

    const talentIds = new Set(talentNow.map((t) => t.talent_user_id));
    const talentIdsPrior = new Set(talentPrior.map((t) => t.talent_user_id));
    const now = activeSets(rowsNow.filter((r) => talentIds.has(r.actor_id)));

    const [pairsNow, pairsPrior] = await Promise.all([
      northStarPairs(admin, period, ts),
      northStarPairs(admin, prior, ts),
    ]);
    void talentIdsPrior;
    const northStarCount = pairsNow.filter((p) => p.both).length;
    const northStarPriorCount = pairsPrior.filter((p) => p.both).length;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    // ---- Growth & funnel -----------------------------------------------------
    const { data: agencyRows, error: agErr } = await admin
      .from("agencies")
      .select("id, created_at")
      .gte("created_at", prior.fromIso)
      .lte("created_at", period.toIso);
    if (agErr) throw databaseError(agErr);
    const scopedAgencies = (agencyRows ?? []).filter((a) => keepAgency(a.id));
    const inWin = (ts2: string, p: Period) => ts2 >= p.fromIso && ts2 <= p.toIso;
    const agenciesAdded = scopedAgencies.filter((a) => inWin(a.created_at, period)).length;
    const agenciesAddedPrior = scopedAgencies.filter((a) => inWin(a.created_at, prior)).length;

    const funnel = funnelSummaries(
      await loadInviteFunnelRows(admin, ts),
      period.fromIso,
      period.toIso,
    );

    // ---- Engagement ----------------------------------------------------------
    const { data: sharesAll, error: shareErr } = await admin
      .from("loved_one_shares")
      .select("id, talent_id, created_at")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso);
    if (shareErr) throw databaseError(shareErr);
    const sharesInPeriod = (sharesAll ?? []).filter((s) =>
      ts.keep(ts.talentProfileIsTest(s.talent_id)),
    );
    const shareTalentIds = [...new Set(sharesInPeriod.map((s) => s.talent_id))].filter(Boolean);
    let agenciesWithShare = 0;
    if (shareTalentIds.length > 0) {
      const { data: profs } = await admin
        .from("talent_profiles")
        .select("id, agency_id")
        .in("id", shareTalentIds as string[]);
      agenciesWithShare = new Set((profs ?? []).map((p) => p.agency_id).filter(Boolean)).size;
    }

    const [shared, priv, linkRows] = await Promise.all([
      admin
        .from("talent_shared_documents")
        .select("id, agency_id, talent_link_id")
        .gte("created_at", period.fromIso)
        .lte("created_at", period.toIso),
      admin
        .from("talent_private_documents")
        .select("id, user_id")
        .gte("created_at", period.fromIso)
        .lte("created_at", period.toIso),
      admin.from("agency_talent_links").select("id, talent_user_id"),
    ]);
    if (shared.error) throw databaseError(shared.error);
    if (priv.error) throw databaseError(priv.error);
    if (linkRows.error) throw databaseError(linkRows.error);
    const linkTalent = new Map((linkRows.data ?? []).map((l) => [l.id, l.talent_user_id]));
    const sharedDocs = (shared.data ?? []).filter((d) =>
      ts.keep(
        ts.agencyIsTest(d.agency_id) ||
          ts.talentUserIsTest(d.talent_link_id ? linkTalent.get(d.talent_link_id) : null),
      ),
    ).length;
    const privateDocs = (priv.data ?? []).filter((d) => keepTalent(d.user_id)).length;

    // ---- Financials ----------------------------------------------------------
    const { data: docsAll, error: docErr } = await admin
      .from("agency_billing_docs")
      .select("id, agency_id, kind, status, total_cents, currency, issued_at, created_at")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso);
    if (docErr) throw databaseError(docErr);
    const docsInPeriod = (docsAll ?? []).filter((d) => keepAgency(d.agency_id));
    const quotes = docsInPeriod.filter((d) => d.kind === "quote");
    const invoices = docsInPeriod.filter((d) => d.kind === "invoice" && d.status !== "cancelled");

    const { data: paymentsAll, error: payErr } = await admin
      .from("agency_invoice_payments")
      .select("id, agency_id, amount_cents, paid_on")
      .gte("paid_on", period.from)
      .lte("paid_on", period.to);
    if (payErr) throw databaseError(payErr);
    const paymentsInPeriod = (paymentsAll ?? []).filter((p) => keepAgency(p.agency_id));
    const receivedCents = sumCents(paymentsInPeriod, "amount_cents");

    const invoiceIds = invoices.map((i) => i.id);
    let paidOnPeriodInvoices = 0;
    if (invoiceIds.length > 0) {
      const { data: pays } = await admin
        .from("agency_invoice_payments")
        .select("amount_cents")
        .in("doc_id", invoiceIds);
      paidOnPeriodInvoices = sumCents(pays ?? [], "amount_cents");
    }
    const invoicedCents = sumCents(invoices, "total_cents");

    // ---- Cohort retention ----------------------------------------------------
    const { data: allActivity, error: actErr } = await admin
      .from("talent_audit_log")
      .select("actor_id, created_at")
      .in("action", ACTIVITY_ACTIONS);
    if (actErr) throw databaseError(actErr);
    const byTalent = new Map<string, number[]>();
    for (const a of allActivity ?? []) {
      const list = byTalent.get(a.actor_id) ?? [];
      list.push(new Date(a.created_at).getTime());
      byTalent.set(a.actor_id, list);
    }
    const cohortMap = new Map<string, typeof talentNow>();
    for (const t of talentNow) {
      const month = String(t.created_at).slice(0, 7);
      cohortMap.set(month, [...(cohortMap.get(month) ?? []), t]);
    }
    const cohorts = [...cohortMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, members]) => {
        const within = (days: number) =>
          members.filter((m) => {
            const start = new Date(m.created_at).getTime();
            const limit = start + days * 86400000;
            if (limit > Date.now()) return false;
            return (byTalent.get(m.talent_user_id) ?? []).some((t) => t >= start && t <= limit);
          }).length;
        const mature = (days: number) =>
          members.filter((m) => new Date(m.created_at).getTime() + days * 86400000 <= Date.now())
            .length;
        return {
          month,
          size: members.length,
          d30: { active: within(30), mature: mature(30) },
          d60: { active: within(60), mature: mature(60) },
          d90: { active: within(90), mature: mature(90) },
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      accounts: scope,
      period: { from: period.from, to: period.to },
      prior: { from: prior.from, to: prior.to },
      trackingSince,
      northStar: {
        active: northStarCount,
        total: pairsNow.length,
        pct: pct(northStarCount, pairsNow.length),
        priorPct: pct(northStarPriorCount, pairsPrior.length),
        talentOnlyCount: pairsNow.filter((p) => p.talentActions.length > 0 && !p.both).length,
        agencyOnlyCount: pairsNow.filter((p) => p.agencyActions.length > 0 && !p.both).length,
      },
      growth: {
        agenciesAdded,
        agenciesAddedPrior,
        agencyInvitations: funnel.agency,
        talentInvitations: funnel.talent,
      },
      engagement: {
        activeTalent: now.any.size,
        totalTalent: talentIds.size,
        talentSplit,
        agenciesWithShare,
        sharesCreated: sharesInPeriod.length,
        documentsUploaded: sharedDocs + privateDocs,
        sharedDocuments: sharedDocs,
        privateDocuments: privateDocs,
      },
      financials: {
        currency: "ZAR",
        quotesCount: quotes.length,
        quotesValueCents: sumCents(quotes, "total_cents"),
        invoicesCount: invoices.length,
        invoicesValueCents: invoicedCents,
        receivedCents,
        paymentsCount: paymentsInPeriod.length,
        outstandingCents: Math.max(0, invoicedCents - paidOnPeriodInvoices),
      },
      cohorts,
      accountsByStatus: await accountsByStatus(admin, scope),
    };
  });

/** Current status of every agency and talent account in scope (pause overlays status). */
async function accountsByStatus(admin: SupabaseClient<Database>, scope: AccountScope) {
  const [ag, ta] = await Promise.all([
    admin.from("agencies").select("status, paused_at, is_test"),
    admin
      .from("talent_profiles")
      .select("activation_completed_at, paused_at, suspended_at, is_test")
      .is("deleted_at", null),
  ]);
  if (ag.error) throw databaseError(ag.error);
  if (ta.error) throw databaseError(ta.error);
  return accountStatusCounts(
    [
      ...(ag.data ?? []).map((a) => ({
        type: "agency" as const,
        status: agencyAccountStatus(a),
        is_test: a.is_test,
      })),
      ...(ta.data ?? []).map((t) => ({
        type: "talent" as const,
        status: talentAccountStatus(t.activation_completed_at, t),
        is_test: t.is_test,
      })),
    ],
    scope,
  );
}

// -----------------------------------------------------------------------------
// Raw data drill-down
// -----------------------------------------------------------------------------

export const REPORTING_METRICS = [
  "agencies_added",
  "agency_invitations",
  "talent_invitations",
  "north_star_pairs",
  "active_talent",
  "shares",
  "documents_uploaded",
  "quotes",
  "invoices",
  "payments_received",
  "outstanding",
] as const;

export type ReportingMetric = (typeof REPORTING_METRICS)[number];

const RawInput = PeriodInput.extend({
  metric: z.enum(REPORTING_METRICS),
  limit: z.number().int().min(1).max(200).default(25),
  offset: z.number().int().min(0).default(0),
});

/** Agency names for a set of agency ids, for readable raw rows. */
async function agencyNames(admin: SupabaseClient<Database>, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string | null | undefined, string>();
  const { data } = await admin.from("agencies").select("id, name").in("id", unique);
  return new Map<string | null | undefined, string>((data ?? []).map((a) => [a.id, a.name]));
}

const INVITE_SOURCE_LABEL: Record<InviteFunnelRow["kind"], string> = {
  agency: "Admin",
  talent_admin: "Admin",
  talent_agency: "Agency",
  connection_request: "Connection request",
};

export const getReportingRawRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RawInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const period = toPeriod(data.from, data.to);
    const ts = await loadTestScope(admin, data.accounts);
    const keepAgency = (id: string | null | undefined) => ts.keep(ts.agencyIsTest(id));
    const page = <T>(rows: T[]) => rows.slice(data.offset, data.offset + data.limit);
    const money = (cents: number | null | undefined) => Number(cents ?? 0) / 100;

    switch (data.metric) {
      case "agencies_added": {
        const { data: rows, error } = await admin
          .from("agencies")
          .select("id, name, status, country, contact_email, created_at")
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false });
        if (error) throw databaseError(error);
        const all = (rows ?? []).filter((r) => keepAgency(r.id));
        return {
          total: all.length,
          columns: ["Agency", "Status", "Country", "Contact", "Added"],
          rows: page(all).map((r) => [
            r.name,
            r.status,
            r.country ?? "—",
            r.contact_email ?? "—",
            r.created_at,
          ]),
        };
      }
      case "agency_invitations":
      case "talent_invitations": {
        const kinds: InviteFunnelRow["kind"][] =
          data.metric === "agency_invitations"
            ? ["agency"]
            : ["talent_admin", "talent_agency", "connection_request"];
        const funnelRows = await loadInviteFunnelRows(admin, ts);
        const names = await agencyNames(
          admin,
          funnelRows.map((r) => r.agency_id),
        );
        const all = funnelRows
          .filter((r) => kinds.includes(r.kind) && sentInPeriod(r, period.fromIso, period.toIso))
          .sort((a, b) => (sentAt(a) < sentAt(b) ? 1 : -1));
        const columns =
          data.metric === "agency_invitations"
            ? ["Agency", "Email", "Status", "Sent", "Accepted", "Days to accept"]
            : [
                "Talent",
                "Email",
                "Sent by",
                "Agency",
                "Status",
                "Sent",
                "Accepted",
                "Days to accept",
              ];
        return {
          total: all.length,
          note:
            data.metric === "talent_invitations"
              ? "Invitations that left draft in this period. Connection requests to existing independent talent are listed with “Connection request” and are not counted as invitations."
              : "Agency onboarding invitations that left draft in this period. Drafts are never counted.",
          columns,
          rows: page(all).map((r) => {
            const tail = [
              r.kind === "connection_request" ? (r.state ?? r.status) : r.status,
              sentAt(r),
              r.accepted_at ?? "—",
              daysToAccept(r) ?? "—",
            ];
            return data.metric === "agency_invitations"
              ? [r.name, r.email, ...tail]
              : [
                  r.name || "—",
                  r.email,
                  INVITE_SOURCE_LABEL[r.kind],
                  names.get(r.agency_id) ?? "—",
                  ...tail,
                ];
          }),
        };
      }
      case "north_star_pairs": {
        const pairs = await northStarPairs(admin, period, ts);
        const names = await agencyNames(
          admin,
          pairs.map((p) => p.agencyId),
        );
        const readable = (a: string) => a.replace(/_/g, " ");
        const all = pairs
          .map((p) => [
            names.get(p.agencyId) ?? "—",
            p.talentName,
            p.talentActions.length ? p.talentActions.map(readable).join(", ") : "No activity",
            p.agencyActions.length ? p.agencyActions.map(readable).join(", ") : "No activity",
            p.both
              ? "Both sides"
              : p.talentActions.length
                ? "Talent only"
                : p.agencyActions.length
                  ? "Agency only"
                  : "Neither",
          ])
          .sort((a, b) => {
            const rank = (r: string) =>
              r === "Both sides" ? 0 : r === "Talent only" ? 1 : r === "Agency only" ? 2 : 3;
            return rank(String(a[4])) - rank(String(b[4]));
          });
        return {
          total: all.length,
          note: "Every live agency–talent relationship in the period. Only rows marked “Both sides” count towards the north star. Quotes and invoices are not counted yet — they cannot be tied to a specific talent.",
          columns: ["Agency", "Talent", "Talent activity", "Agency activity", "Counts as engaged"],
          rows: page(all),
        };
      }
      case "active_talent": {
        const rows = await activityRows(admin, period.fromIso, period.toIso);
        const talent = await onboardedTalent(admin, period.toIso, data.accounts);
        const byUser = new Map<string | null, (typeof talent)[number]>();
        for (const t of talent) byUser.set(t.talent_user_id, t);
        const sets = activeSets(rows.filter((r) => byUser.has(r.actor_id)));
        const qualifying = [...sets.any];
        const names = await agencyNames(
          admin,
          qualifying.map((id) => byUser.get(id)?.agency_id),
        );
        const counts = new Map<string, number>();
        const last = new Map<string, string>();
        for (const r of rows) {
          if (!byUser.has(r.actor_id)) continue;
          counts.set(r.actor_id, (counts.get(r.actor_id) ?? 0) + 1);
          const prev = last.get(r.actor_id);
          if (!prev || r.created_at > prev) last.set(r.actor_id, r.created_at);
        }
        const all = qualifying
          .map((id) => {
            const t = byUser.get(id);
            return [
              t?.display_name ?? "—",
              names.get(t?.agency_id) ?? "—",
              counts.get(id) ?? 0,
              last.get(id) ?? "—",
            ];
          })
          .sort((a, b) => Number(b[2]) - Number(a[2]));
        return {
          total: all.length,
          columns: ["Talent", "Agency", "Actions in period", "Last activity"],
          rows: page(all),
        };
      }
      case "shares": {
        const { data: rows, error } = await admin
          .from("loved_one_shares")
          .select(
            "talent_id, loved_one_name, loved_one_email, share_kind, permission, is_active, revoked_at, expires_at, created_at",
          )
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false });
        if (error) throw databaseError(error);
        const all = (rows ?? []).filter((r) => ts.keep(ts.talentProfileIsTest(r.talent_id)));
        return {
          total: all.length,
          columns: [
            SHARE_RECIPIENT_TERM_CAPITALISED,
            "Email",
            "Kind",
            "Permission",
            "Active",
            "Created",
          ],
          rows: page(all).map((r) => [
            r.loved_one_name ?? "—",
            r.loved_one_email,
            r.share_kind,
            r.permission,
            // Live = active, not stopped and not yet expired.
            r.is_active && !r.revoked_at && Date.parse(r.expires_at) > Date.now() ? "Yes" : "No",
            r.created_at,
          ]),
        };
      }
      case "documents_uploaded": {
        const [shared, priv, links] = await Promise.all([
          admin
            .from("talent_shared_documents")
            .select("name, folder, status, agency_id, talent_link_id, created_at")
            .gte("created_at", period.fromIso)
            .lte("created_at", period.toIso)
            .order("created_at", { ascending: false }),
          admin
            .from("talent_private_documents")
            .select("user_id")
            .gte("created_at", period.fromIso)
            .lte("created_at", period.toIso),
          admin.from("agency_talent_links").select("id, talent_user_id"),
        ]);
        if (shared.error) throw databaseError(shared.error);
        if (priv.error) throw databaseError(priv.error);
        if (links.error) throw databaseError(links.error);
        const linkTalent = new Map((links.data ?? []).map((l) => [l.id, l.talent_user_id]));
        const all = (shared.data ?? []).filter((d) =>
          ts.keep(
            ts.agencyIsTest(d.agency_id) ||
              ts.talentUserIsTest(d.talent_link_id ? linkTalent.get(d.talent_link_id) : null),
          ),
        );
        const privateCount = (priv.data ?? []).filter((d) =>
          ts.keep(ts.talentUserIsTest(d.user_id)),
        ).length;
        const names = await agencyNames(
          admin,
          all.map((r) => r.agency_id),
        );
        return {
          total: all.length,
          note:
            privateCount > 0
              ? `${privateCount} private vault document${privateCount === 1 ? "" : "s"} are counted in the summary but not listed here — private vault contents stay private.`
              : undefined,
          columns: ["Document", "Folder", "Status", "Agency", "Uploaded"],
          rows: page(all).map((r) => [
            r.name,
            r.folder,
            r.status,
            names.get(r.agency_id) ?? "—",
            r.created_at,
          ]),
        };
      }
      case "quotes":
      case "invoices":
      case "outstanding": {
        const kind = data.metric === "quotes" ? "quote" : "invoice";
        const { data: rows, error } = await admin
          .from("agency_billing_docs")
          .select(
            "id, agency_id, number, client_name, talent_name, issued_at, due_date, total_cents, currency, status, created_at",
          )
          .eq("kind", kind)
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false });
        if (error) throw databaseError(error);
        const all = (rows ?? []).filter((r) => keepAgency(r.agency_id));
        const shown = page(all);
        const names = await agencyNames(
          admin,
          shown.map((r) => r.agency_id),
        );
        const ids = shown.map((r) => r.id);
        const paid = new Map<string, number>();
        if (ids.length > 0) {
          const { data: pays } = await admin
            .from("agency_invoice_payments")
            .select("doc_id, amount_cents")
            .in("doc_id", ids);
          for (const p of pays ?? []) {
            paid.set(p.doc_id, (paid.get(p.doc_id) ?? 0) + Number(p.amount_cents ?? 0));
          }
        }
        return {
          total: all.length,
          columns:
            kind === "quote"
              ? ["Agency", "Number", "Client", "Issued", "Amount", "Status"]
              : [
                  "Agency",
                  "Number",
                  "Client",
                  "Issued",
                  "Amount",
                  "Amount paid",
                  "Outstanding",
                  "Status",
                ],
          rows: shown.map((r) => {
            const base = [
              names.get(r.agency_id) ?? "—",
              r.number,
              r.client_name ?? r.talent_name ?? "—",
              r.issued_at,
            ];
            if (kind === "quote") return [...base, money(r.total_cents), r.status];
            const received = paid.get(r.id) ?? 0;
            return [
              ...base,
              money(r.total_cents),
              money(received),
              money(Math.max(0, Number(r.total_cents ?? 0) - received)),
              r.status,
            ];
          }),
        };
      }
      case "payments_received": {
        const { data: rows, error } = await admin
          .from("agency_invoice_payments")
          .select("id, doc_id, agency_id, amount_cents, paid_on, method, reference")
          .gte("paid_on", period.from)
          .lte("paid_on", period.to)
          .order("paid_on", { ascending: false });
        if (error) throw databaseError(error);
        const all = (rows ?? []).filter((r) => keepAgency(r.agency_id));
        const shown = page(all);
        const names = await agencyNames(
          admin,
          shown.map((r) => r.agency_id),
        );
        const docIds = [...new Set(shown.map((r) => r.doc_id))];
        const docs = new Map<
          string,
          Pick<
            Tables<"agency_billing_docs">,
            "id" | "number" | "client_name" | "total_cents" | "status"
          >
        >();
        if (docIds.length > 0) {
          const { data: d } = await admin
            .from("agency_billing_docs")
            .select("id, number, client_name, total_cents, status")
            .in("id", docIds);
          for (const row of d ?? []) docs.set(row.id, row);
        }
        return {
          total: all.length,
          columns: [
            "Agency",
            "Invoice",
            "Client",
            "Invoice total",
            "Amount received",
            "Date received",
            "Method",
            "Status",
          ],
          rows: shown.map((r) => {
            const d = docs.get(r.doc_id);
            return [
              names.get(r.agency_id) ?? "—",
              d?.number ?? "—",
              d?.client_name ?? "—",
              money(d?.total_cents ?? 0),
              money(r.amount_cents),
              r.paid_on,
              r.method ?? "—",
              d?.status ?? "—",
            ];
          }),
        };
      }
      default:
        throw new Error("Unknown metric");
    }
  });
