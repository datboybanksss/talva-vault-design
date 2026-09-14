import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TALENT_LOGIN_ACTION, TALENT_VAULT_ACTIONS } from "@/lib/talent-activity.shared";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

const PeriodInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

/** Every activity row in a window, keyed by the talent who generated it. */
async function activityRows(admin: any, fromIso: string, toIso: string) {
  const { data, error } = await admin
    .from("talent_audit_log")
    .select("actor_id, action, created_at")
    .in("action", ACTIVITY_ACTIONS)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (error) throw new Error(error.message);
  return (data ?? []) as { actor_id: string; action: string; created_at: string }[];
}

/** Onboarded talent: a live link between an agency and a signed-up talent. */
async function onboardedTalent(admin: any, toIso: string) {
  const { data, error } = await admin
    .from("agency_talent_links")
    .select("id, agency_id, talent_user_id, display_name, status, created_at")
    .not("talent_user_id", "is", null)
    .neq("status", "revoked")
    .lte("created_at", toIso);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
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

export const getReportingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PeriodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const period = toPeriod(data.from, data.to);
    const prior = priorPeriod(period);

    // ---- Activity tracking (north star + engagement) -------------------------
    const { data: firstActivity } = await admin
      .from("talent_audit_log")
      .select("created_at")
      .in("action", ACTIVITY_ACTIONS)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const trackingSince: string | null = firstActivity?.created_at ?? null;

    const [rowsNow, rowsPrior, talentNow, talentPrior] = await Promise.all([
      activityRows(admin, period.fromIso, period.toIso),
      activityRows(admin, prior.fromIso, prior.toIso),
      onboardedTalent(admin, period.toIso),
      onboardedTalent(admin, prior.toIso),
    ]);

    const talentIds = new Set(talentNow.map((t) => t.talent_user_id));
    const talentIdsPrior = new Set(talentPrior.map((t) => t.talent_user_id));

    const now = activeSets(rowsNow.filter((r) => talentIds.has(r.actor_id)));
    const before = activeSets(rowsPrior.filter((r) => talentIdsPrior.has(r.actor_id)));

    const northStarCount = [...now.logins].filter((id) => now.vault.has(id)).length;
    const northStarPriorCount = [...before.logins].filter((id) => before.vault.has(id)).length;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    // ---- Growth & funnel -----------------------------------------------------
    const [{ count: agenciesAdded }, { count: agenciesAddedPrior }] = await Promise.all([
      admin.from("agencies").select("id", { count: "exact", head: true })
        .gte("created_at", period.fromIso).lte("created_at", period.toIso),
      admin.from("agencies").select("id", { count: "exact", head: true })
        .gte("created_at", prior.fromIso).lte("created_at", prior.toIso),
    ]);

    const { data: invitesInPeriod, error: invErr } = await admin
      .from("agency_invitations")
      .select("id, status, created_at, accepted_at")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso);
    if (invErr) throw new Error(invErr.message);
    const invitesSent = (invitesInPeriod ?? []).length;
    const invitesAccepted = (invitesInPeriod ?? []).filter((i: any) => i.accepted_at).length;

    const { data: acceptedInPeriod, error: accErr } = await admin
      .from("agency_invitations")
      .select("created_at, accepted_at")
      .not("accepted_at", "is", null)
      .gte("accepted_at", period.fromIso)
      .lte("accepted_at", period.toIso);
    if (accErr) throw new Error(accErr.message);
    const daysToAccept = (acceptedInPeriod ?? []).map(
      (i: any) =>
        Math.round(
          ((new Date(i.accepted_at).getTime() - new Date(i.created_at).getTime()) / 86400000) * 10,
        ) / 10,
    );

    // ---- Engagement ----------------------------------------------------------
    const { data: sharesInPeriod, error: shareErr } = await admin
      .from("loved_one_shares")
      .select("id, talent_id, created_at")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso);
    if (shareErr) throw new Error(shareErr.message);
    const shareTalentIds = [...new Set((sharesInPeriod ?? []).map((s: any) => s.talent_id))].filter(Boolean);
    let agenciesWithShare = 0;
    if (shareTalentIds.length > 0) {
      const { data: profs } = await admin
        .from("talent_profiles")
        .select("id, agency_id")
        .in("id", shareTalentIds as string[]);
      agenciesWithShare = new Set(
        (profs ?? []).map((p: any) => p.agency_id).filter(Boolean),
      ).size;
    }

    const [{ count: sharedDocs }, { count: privateDocs }] = await Promise.all([
      admin.from("talent_shared_documents").select("id", { count: "exact", head: true })
        .gte("created_at", period.fromIso).lte("created_at", period.toIso),
      admin.from("talent_private_documents").select("id", { count: "exact", head: true })
        .gte("created_at", period.fromIso).lte("created_at", period.toIso),
    ]);

    // ---- Financials ----------------------------------------------------------
    const { data: docsInPeriod, error: docErr } = await admin
      .from("agency_billing_docs")
      .select("id, kind, status, total_cents, currency, issued_at, created_at")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso);
    if (docErr) throw new Error(docErr.message);
    const quotes = (docsInPeriod ?? []).filter((d: any) => d.kind === "quote");
    const invoices = (docsInPeriod ?? []).filter(
      (d: any) => d.kind === "invoice" && d.status !== "cancelled",
    );

    const { data: paymentsInPeriod, error: payErr } = await admin
      .from("agency_invoice_payments")
      .select("id, amount_cents, paid_on")
      .gte("paid_on", period.from)
      .lte("paid_on", period.to);
    if (payErr) throw new Error(payErr.message);
    const receivedCents = (paymentsInPeriod ?? []).reduce(
      (n: number, p: any) => n + Number(p.amount_cents ?? 0),
      0,
    );

    // Outstanding: invoices raised in the period, less everything received
    // against them whenever that payment was made.
    const invoiceIds = invoices.map((i: any) => i.id);
    let paidOnPeriodInvoices = 0;
    if (invoiceIds.length > 0) {
      const { data: pays } = await admin
        .from("agency_invoice_payments")
        .select("amount_cents")
        .in("doc_id", invoiceIds);
      paidOnPeriodInvoices = (pays ?? []).reduce(
        (n: number, p: any) => n + Number(p.amount_cents ?? 0),
        0,
      );
    }
    const invoicedCents = invoices.reduce((n: number, i: any) => n + Number(i.total_cents ?? 0), 0);

    // ---- Cohort retention ----------------------------------------------------
    const { data: allActivity, error: actErr } = await admin
      .from("talent_audit_log")
      .select("actor_id, created_at")
      .in("action", ACTIVITY_ACTIONS);
    if (actErr) throw new Error(actErr.message);
    const byTalent = new Map<string, number[]>();
    for (const a of allActivity ?? []) {
      const list = byTalent.get(a.actor_id) ?? [];
      list.push(new Date(a.created_at).getTime());
      byTalent.set(a.actor_id, list);
    }
    const cohortMap = new Map<string, any[]>();
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
            return (byTalent.get(m.talent_user_id) ?? []).some(
              (ts) => ts >= start && ts <= limit,
            );
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
      period: { from: period.from, to: period.to },
      prior: { from: prior.from, to: prior.to },
      trackingSince,
      northStar: {
        active: northStarCount,
        total: talentIds.size,
        pct: pct(northStarCount, talentIds.size),
        priorPct: pct(northStarPriorCount, talentIdsPrior.size),
      },
      growth: {
        agenciesAdded: agenciesAdded ?? 0,
        agenciesAddedPrior: agenciesAddedPrior ?? 0,
        invitesSent,
        invitesAccepted,
        acceptanceRate: pct(invitesAccepted, invitesSent),
        medianDaysToAccept: median(daysToAccept),
        acceptedInPeriod: daysToAccept.length,
      },
      engagement: {
        activeTalent: now.any.size,
        totalTalent: talentIds.size,
        agenciesWithShare,
        sharesCreated: (sharesInPeriod ?? []).length,
        documentsUploaded: (sharedDocs ?? 0) + (privateDocs ?? 0),
        sharedDocuments: sharedDocs ?? 0,
        privateDocuments: privateDocs ?? 0,
      },
      financials: {
        currency: "ZAR",
        quotesCount: quotes.length,
        quotesValueCents: quotes.reduce((n: number, q: any) => n + Number(q.total_cents ?? 0), 0),
        invoicesCount: invoices.length,
        invoicesValueCents: invoicedCents,
        receivedCents,
        paymentsCount: (paymentsInPeriod ?? []).length,
        outstandingCents: Math.max(0, invoicedCents - paidOnPeriodInvoices),
      },
      cohorts,
    };
  });

// -----------------------------------------------------------------------------
// Raw data drill-down
// -----------------------------------------------------------------------------

export const REPORTING_METRICS = [
  "agencies_added",
  "invitations",
  "invitations_accepted",
  "north_star_talent",
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
async function agencyNames(admin: any, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await admin.from("agencies").select("id, name").in("id", unique);
  return new Map<string, string>((data ?? []).map((a: any) => [a.id, a.name]));
}

export const getReportingRawRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RawInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const period = toPeriod(data.from, data.to);
    const range = { from: data.offset, to: data.offset + data.limit - 1 };
    const money = (cents: number) => Number(cents ?? 0) / 100;

    switch (data.metric) {
      case "agencies_added": {
        const { data: rows, count, error } = await admin
          .from("agencies")
          .select("name, status, country, contact_email, created_at", { count: "exact" })
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        return {
          total: count ?? 0,
          columns: ["Agency", "Status", "Country", "Contact", "Added"],
          rows: (rows ?? []).map((r: any) => [
            r.name, r.status, r.country ?? "—", r.contact_email ?? "—", r.created_at,
          ]),
        };
      }
      case "invitations":
      case "invitations_accepted": {
        let q = admin
          .from("agency_invitations")
          .select("agency_name, email, status, created_at, accepted_at", { count: "exact" });
        if (data.metric === "invitations") {
          q = q.gte("created_at", period.fromIso).lte("created_at", period.toIso);
        } else {
          q = q
            .not("accepted_at", "is", null)
            .gte("accepted_at", period.fromIso)
            .lte("accepted_at", period.toIso);
        }
        const { data: rows, count, error } = await q
          .order("created_at", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        return {
          total: count ?? 0,
          columns: ["Agency", "Email", "Status", "Invited", "Accepted", "Days to accept"],
          rows: (rows ?? []).map((r: any) => [
            r.agency_name, r.email, r.status, r.created_at, r.accepted_at ?? "—",
            r.accepted_at
              ? Math.round(
                  ((new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()) /
                    86400000) * 10,
                ) / 10
              : "—",
          ]),
        };
      }
      case "north_star_talent":
      case "active_talent": {
        const rows = await activityRows(admin, period.fromIso, period.toIso);
        const talent = await onboardedTalent(admin, period.toIso);
        const byUser = new Map<string, any>();
        for (const t of talent) byUser.set(t.talent_user_id, t);
        const sets = activeSets(rows.filter((r) => byUser.has(r.actor_id)));
        const qualifying =
          data.metric === "north_star_talent"
            ? [...sets.logins].filter((id) => sets.vault.has(id))
            : [...sets.any];
        const names = await agencyNames(admin, qualifying.map((id) => byUser.get(id)?.agency_id));
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
          rows: all.slice(range.from, range.to + 1),
        };
      }
      case "shares": {
        const { data: rows, count, error } = await admin
          .from("loved_one_shares")
          .select("loved_one_name, loved_one_email, share_kind, permission, is_active, created_at", {
            count: "exact",
          })
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        return {
          total: count ?? 0,
          columns: ["Recipient", "Email", "Kind", "Permission", "Active", "Created"],
          rows: (rows ?? []).map((r: any) => [
            r.loved_one_name ?? "—", r.loved_one_email, r.share_kind, r.permission,
            r.is_active ? "Yes" : "No", r.created_at,
          ]),
        };
      }
      case "documents_uploaded": {
        const { data: rows, count, error } = await admin
          .from("talent_shared_documents")
          .select("name, folder, status, agency_id, created_at", { count: "exact" })
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        const names = await agencyNames(admin, (rows ?? []).map((r: any) => r.agency_id));
        const { count: privateCount } = await admin
          .from("talent_private_documents")
          .select("id", { count: "exact", head: true })
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso);
        return {
          total: count ?? 0,
          note:
            (privateCount ?? 0) > 0
              ? `${privateCount} private vault document${(privateCount ?? 0) === 1 ? "" : "s"} are counted in the summary but never listed — vault contents stay private.`
              : undefined,
          columns: ["Document", "Folder", "Status", "Agency", "Uploaded"],
          rows: (rows ?? []).map((r: any) => [
            r.name, r.folder, r.status, names.get(r.agency_id) ?? "—", r.created_at,
          ]),
        };
      }
      case "quotes":
      case "invoices":
      case "outstanding": {
        const kind = data.metric === "quotes" ? "quote" : "invoice";
        const { data: rows, count, error } = await admin
          .from("agency_billing_docs")
          .select(
            "id, agency_id, number, client_name, talent_name, issued_at, due_date, total_cents, currency, status, created_at",
            { count: "exact" },
          )
          .eq("kind", kind)
          .gte("created_at", period.fromIso)
          .lte("created_at", period.toIso)
          .order("created_at", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        const names = await agencyNames(admin, (rows ?? []).map((r: any) => r.agency_id));
        const ids = (rows ?? []).map((r: any) => r.id);
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
          total: count ?? 0,
          columns:
            kind === "quote"
              ? ["Agency", "Number", "Client", "Issued", "Amount", "Status"]
              : ["Agency", "Number", "Client", "Issued", "Amount", "Amount paid", "Outstanding", "Status"],
          rows: (rows ?? []).map((r: any) => {
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
        const { data: rows, count, error } = await admin
          .from("agency_invoice_payments")
          .select("id, doc_id, agency_id, amount_cents, paid_on, method, reference", {
            count: "exact",
          })
          .gte("paid_on", period.from)
          .lte("paid_on", period.to)
          .order("paid_on", { ascending: false })
          .range(range.from, range.to);
        if (error) throw new Error(error.message);
        const names = await agencyNames(admin, (rows ?? []).map((r: any) => r.agency_id));
        const docIds = [...new Set((rows ?? []).map((r: any) => r.doc_id))];
        const docs = new Map<string, any>();
        if (docIds.length > 0) {
          const { data: d } = await admin
            .from("agency_billing_docs")
            .select("id, number, client_name, total_cents, status")
            .in("id", docIds);
          for (const row of d ?? []) docs.set(row.id, row);
        }
        return {
          total: count ?? 0,
          columns: ["Agency", "Invoice", "Client", "Invoice total", "Amount received", "Date received", "Method", "Status"],
          rows: (rows ?? []).map((r: any) => {
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
