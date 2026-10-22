import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  invitationFunnel,
  launchOffer,
  launchProgress,
  parseLaunchSettings,
  sastRange,
  termsOutstanding,
  type InviteRow,
  type OfferCandidate,
  type TermsPerson,
} from "@/lib/launch-reporting-core";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Filters = z.object({
  from: day,
  to: day,
  type: z.enum(["all", "agency", "talent"]).default("all"),
  segment: z.enum(["all", "agency_linked", "independent"]).default("all"),
  accounts: z.enum(["real", "test", "all"]).default("real"),
  offerOffset: z.number().int().min(0).max(5000).default(0),
  termsOffset: z.number().int().min(0).max(5000).default(0),
  outstandingOffset: z.number().int().min(0).max(5000).default(0),
  // CSV export asks for every row with the same rules as the screen.
  limit: z.number().int().min(1).max(5000).default(10),
});

function check<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/** Loads every invitation the reports count (admin agency onboarding, independent and agency talent; inert excluded). */
export async function loadInviteRows(admin: any): Promise<InviteRow[]> {
  const [ag, ind, tal, inert, testAg, testTal] = await Promise.all([
    admin
      .from("agency_invitations")
      .select("id, agency_id, email, status, created_at, expires_at, first_sent_at, accepted_at, source, agency_name")
      .eq("kind", "agency_onboarding"),
    admin
      .from("independent_talent_invitations")
      .select("id, email, status, created_at, expires_at, first_sent_at, accepted_at, source, talent_name"),
    admin
      .from("talent_invitations")
      .select("id, email, status, created_at, expires_at, first_sent_at, accepted_at, talent_name"),
    admin.from("talent_invite_private").select("invitation_id").eq("kind", "inert"),
    admin.from("agencies").select("id").eq("is_test", true),
    admin.from("talent_profiles").select("email").eq("is_test", true),
  ]);
  const testAgencies = new Set(check<any[]>(testAg).map((r) => r.id));
  const testEmails = new Set(
    check<any[]>(testTal).map((r) => String(r.email ?? "").trim().toLowerCase()),
  );
  const inertIds = new Set(check<any[]>(inert).map((r) => r.invitation_id));
  const map = (rows: any[], type: "agency" | "talent", segment: any, source: (r: any) => any) =>
    rows.map((r) => ({
      id: r.id,
      type,
      segment,
      status: String(r.status),
      email: String(r.email ?? "").trim().toLowerCase(),
      created_at: r.created_at,
      expires_at: r.expires_at,
      first_sent_at: r.first_sent_at,
      accepted_at: r.accepted_at,
      source: source(r),
      name: r.agency_name ?? r.talent_name ?? "",
      agency_id: r.agency_id ?? null,
      // Test account: the agency is marked test, or the talent's email belongs to a test profile.
      is_test:
        type === "agency"
          ? !!r.agency_id && testAgencies.has(r.agency_id)
          : testEmails.has(String(r.email ?? "").trim().toLowerCase()),
    }));
  return [
    ...map(check<any[]>(ag), "agency", null, (r) => r.source),
    ...map(check<any[]>(ind), "talent", "independent", (r) => r.source),
    // Agency-sent talent invitations are sourced by that agency.
    ...map(
      check<any[]>(tal).filter((r) => !inertIds.has(r.id)),
      "talent",
      "agency_linked",
      () => "agency",
    ),
  ] as InviteRow[];
}

export const getLaunchSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const row = check<any>(
      await supabase.from("platform_settings").select("value, updated_at").eq("key", "launch").maybeSingle(),
    );
    return { settings: parseLaunchSettings(row?.value), updatedAt: row?.updated_at ?? null };
  });

export const updateLaunchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        launch_date: day,
        window_months: z.number().int().min(1).max(36),
        talent_target: z.number().int().min(0).max(1000000),
        agency_target: z.number().int().min(0).max(100000),
        offer_free_months: z.number().int().min(0).max(36),
        offer_talent_places: z.number().int().min(0).max(1000000),
        offer_agency_places: z.number().int().min(0).max(100000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
    if (!canEdit) throw new Error("You need edit permission to change launch settings.");
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key: "launch", value: data, updated_at: new Date().toISOString(), updated_by: userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLaunchReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Filters.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const settingsRow = check<any>(
      await admin.from("platform_settings").select("value").eq("key", "launch").maybeSingle(),
    );
    const settings = parseLaunchSettings(settingsRow?.value);
    if (!settings) throw new Error("Launch settings are missing. Add them under Launch settings.");

    const [talent, agencyAccepted, invites, members, links, acc, docs] = await Promise.all([
      admin
        .from("talent_profiles")
        .select("user_id, full_name, email, activation_completed_at")
        .is("deleted_at", null)
        .eq("is_test", false),
      admin
        .from("agency_invitations")
        .select("accepted_at")
        .eq("kind", "agency_onboarding")
        .eq("status", "accepted"),
      loadInviteRows(admin),
      admin.from("agency_members").select("user_id, agency_id"),
      admin.from("agency_talent_links").select("talent_user_id").eq("status", "active"),
      admin
        .from("legal_acceptances")
        .select("id, user_id, document_id, doc_type, version, accepted_at, body_sha256, hash_retrospective, user_email, user_full_name, user_role, proof_ref")
        .order("accepted_at", { ascending: false }),
      admin.from("legal_documents").select("id, doc_type, version").eq("is_current", true),
    ]);
    const talentRows = check<any[]>(talent);

    // 1. Launch progress — activated talent and accepted agency onboarding.
    const progress = launchProgress(
      {
        talentJoined: talentRows.map((t) => t.activation_completed_at),
        agenciesJoined: check<any[]>(agencyAccepted).map((a) => a.accepted_at),
      },
      settings,
    );

    // 2. Launch offer.
    const offer = launchOffer(invites as unknown as OfferCandidate[], settings);
    const offerRows = [...offer.agency.rows, ...offer.talent.rows].filter(
      (r) => data.type === "all" || r.type === data.type,
    );

    // 3. Invitation conversion.
    const range = sastRange(data.from, data.to);
    const funnel = invitationFunnel(
      invites,
      { ...range, type: data.type, segment: data.segment },
      nowIso,
    );

    // 4. Terms.
    const linked = new Set(check<any[]>(links).map((l) => l.talent_user_id));
    const profiles = new Map<string, any>();
    const memberIds = [...new Set(check<any[]>(members).map((m) => m.user_id))];
    if (memberIds.length) {
      const p = check<any[]>(
        await admin.from("profiles").select("id, email, display_name, first_name, last_name").in("id", memberIds),
      );
      for (const r of p) profiles.set(r.id, r);
    }
    const { data: adminRoles } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    const admins = new Set(((adminRoles ?? []) as any[]).map((r) => r.user_id));
    const people: TermsPerson[] = [
      ...talentRows
        .filter((t) => t.user_id && !admins.has(t.user_id))
        .map((t) => ({
          user_id: t.user_id,
          name: t.full_name ?? "",
          email: t.email ?? "",
          docType: "talent" as const,
          segment: linked.has(t.user_id) ? ("agency_linked" as const) : ("independent" as const),
        })),
      ...memberIds
        .filter((id) => !admins.has(id))
        .map((id) => {
          const p = profiles.get(id);
          const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ");
          return { user_id: id, name: name ?? "", email: p?.email ?? "", docType: "agency" as const, segment: null };
        }),
    ];
    const peopleFiltered = people.filter(
      (p) =>
        (data.type === "all" || p.docType === data.type) &&
        (data.segment === "all" || p.docType !== "talent" || p.segment === data.segment),
    );
    const accRows = check<any[]>(acc);
    const currentDocs = check<any[]>(docs);
    const currentIds = new Set(currentDocs.map((d) => d.id));
    const outstanding = termsOutstanding(peopleFiltered, accRows, currentDocs);
    const accInRange = accRows
      .filter((a) => a.accepted_at >= range.fromIso && a.accepted_at <= range.toIso)
      .filter((a) => data.type === "all" || a.doc_type === data.type)
      .map((a) => ({ ...a, is_current: currentIds.has(a.document_id) }));

    const page = <T,>(rows: T[], offset: number) => rows.slice(offset, offset + data.limit);

    return {
      generatedAt: nowIso,
      settings,
      progress,
      offer: {
        talent: { places: offer.talent.places, allocated: offer.talent.allocated, used: offer.talent.used },
        agency: { places: offer.agency.places, allocated: offer.agency.allocated, used: offer.agency.used },
        total: offerRows.length,
        rows: page(offerRows, data.offerOffset),
        notRecordedSentBefore: invites.filter((i) => i.status !== "draft" && !i.first_sent_at).length,
      },
      funnel,
      terms: {
        current: currentDocs,
        acceptancesTotal: accInRange.length,
        acceptances: page(accInRange, data.termsOffset),
        outstandingTotal: outstanding.length,
        outstanding: page(outstanding, data.outstandingOffset),
        peopleInScope: peopleFiltered.length,
      },
    };
  });

