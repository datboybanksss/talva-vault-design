import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
import { checkRows as check, checkRow } from "./query-results";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  inLaunchWindow,
  inviteBucket,
  invitationFunnel,
  launchOffer,
  matchesInviteFilter,
  launchProgress,
  parseLaunchSettings,
  sastRange,
  termsOutstanding,
  type InviteRow,
  type OfferCandidate,
  type TermsPerson,
} from "@/lib/launch-reporting-core";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

const day = z
  .string()
  .max(10000)
  .regex(/^\d{4}-\d{2}-\d{2}$/);
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

/** Loads every invitation the reports count (admin agency onboarding, independent and agency talent; inert excluded). */
export async function loadInviteRows(
  admin: SupabaseClient<Database>,
): Promise<(InviteRow & { name: string })[]> {
  const [ag, ind, tal, inert, testAg, testTal] = await Promise.all([
    admin
      .from("agency_invitations")
      .select(
        "id, agency_id, email, status, created_at, expires_at, first_sent_at, accepted_at, source, agency_name",
      )
      .eq("kind", "agency_onboarding"),
    admin
      .from("independent_talent_invitations")
      .select(
        "id, email, status, created_at, expires_at, first_sent_at, accepted_at, source, talent_name",
      ),
    admin
      .from("talent_invitations")
      .select("id, email, status, created_at, expires_at, first_sent_at, accepted_at, talent_name"),
    admin.from("talent_invite_private").select("invitation_id").eq("kind", "inert"),
    admin.from("agencies").select("id").eq("is_test", true),
    admin.from("talent_profiles").select("email").eq("is_test", true),
  ]);
  const testAgencies = new Set(check(testAg).map((r) => r.id));
  const testEmails = new Set(
    check(testTal).map((r) =>
      String(r.email ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  const inertIds = new Set(check(inert).map((r) => r.invitation_id));
  type InviteSourceRow = Pick<
    Tables<"talent_invitations">,
    "id" | "email" | "status" | "created_at" | "expires_at" | "first_sent_at" | "accepted_at"
  > & {
    agency_name?: string;
    talent_name?: string | null;
    agency_id?: string | null;
    source?: string | null;
  };
  const map = <R extends InviteSourceRow>(
    rows: R[],
    type: "agency" | "talent",
    segment: InviteRow["segment"],
    source: (r: R) => InviteRow["source"],
  ) =>
    rows.map((r) => ({
      id: r.id,
      type,
      segment,
      status: String(r.status),
      email: String(r.email ?? "")
        .trim()
        .toLowerCase(),
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
          : testEmails.has(
              String(r.email ?? "")
                .trim()
                .toLowerCase(),
            ),
    }));
  return [
    ...map(check(ag), "agency", null, (r) => r.source),
    ...map(check(ind), "talent", "independent", (r) => r.source),
    // Agency-sent talent invitations are sourced by that agency.
    ...map(
      check(tal).filter((r) => !inertIds.has(r.id)),
      "talent",
      "agency_linked",
      () => "agency",
    ),
  ];
}

export const getLaunchSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const row = checkRow<Pick<Tables<"platform_settings">, "value" | "updated_at">>(
      await supabase
        .from("platform_settings")
        .select("value, updated_at")
        .eq("key", "launch")
        .maybeSingle(),
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
    const { supabase, userId } = context;
    const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
    if (!canEdit) throw new Error("You need edit permission to change launch settings.");
    const { error } = await supabase.from("platform_settings").upsert({
      key: "launch",
      value: data,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
    if (error) throw databaseError(error);
    return { ok: true };
  });

export const getLaunchReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Filters.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const settingsRow = checkRow<Pick<Tables<"platform_settings">, "value">>(
      await admin.from("platform_settings").select("value").eq("key", "launch").maybeSingle(),
    );
    const settings = parseLaunchSettings(settingsRow?.value);
    if (!settings) throw new Error("Launch settings are missing. Add them under Launch settings.");

    const [talent, agencyAccepted, invites, members, links, acc, docs, agencyRows] =
      await Promise.all([
        admin
          .from("talent_profiles")
          .select("user_id, full_name, email, created_at, activation_completed_at, is_test")
          .is("deleted_at", null),
        admin
          .from("agency_invitations")
          .select(
            "id, agency_id, agency_name, email, first_sent_at, created_at, accepted_at, status",
          )
          .eq("kind", "agency_onboarding")
          .eq("status", "accepted"),
        loadInviteRows(admin),
        admin.from("agency_members").select("user_id, agency_id"),
        admin
          .from("agency_talent_links")
          .select("talent_user_id, agency_id")
          .eq("status", "active"),
        admin
          .from("legal_acceptances")
          .select(
            "id, user_id, document_id, doc_type, version, accepted_at, body_sha256, hash_retrospective, user_email, user_full_name, user_role, proof_ref",
          )
          .order("accepted_at", { ascending: false }),
        admin.from("legal_documents").select("id, doc_type, version").eq("is_current", true),
        admin.from("agencies").select("id, name, status, is_test"),
      ]);
    const scope = data.accounts;
    const inScope = (isTest: boolean | null | undefined) =>
      scope === "all" ? true : scope === "test" ? !!isTest : !isTest;
    const agencyById = new Map(check(agencyRows).map((a) => [a.id, a]));
    const allTalent = check(talent);
    const talentRows = allTalent.filter((t) => inScope(t.is_test));
    const agencyAcc = check(agencyAccepted).filter((a) =>
      inScope(a.agency_id ? agencyById.get(a.agency_id)?.is_test : false),
    );
    const scopedInvites = invites.filter((i) => inScope(i.is_test));

    // 1. Launch progress — activated talent and accepted agency onboarding.
    const progress = launchProgress(
      {
        talentJoined: talentRows.map((t) => t.activation_completed_at),
        agenciesJoined: agencyAcc.map((a) => a.accepted_at),
      },
      settings,
    );

    // 2. Launch offer.
    // Places are always allocated over real invitations only (test accounts never use one).
    // loadInviteRows supplies name at runtime; InviteRow omits it from its declared report contract.
    const offer = launchOffer(invites, settings);
    const placeById = new Map<string, number>(
      [...offer.agency.rows, ...offer.talent.rows].map((r) => [r.id, r.place]),
    );
    const offerRows = [...offer.agency.rows, ...offer.talent.rows].filter(
      (r) => data.type === "all" || r.type === data.type,
    );

    // 3. Invitation conversion.
    const range = sastRange(data.from, data.to);
    const funnel = invitationFunnel(
      scopedInvites,
      { ...range, type: data.type, segment: data.segment },
      nowIso,
    );

    // 4. Terms.
    const linkRows = check(links);
    const linked = new Set(linkRows.map((l) => l.talent_user_id));
    const agenciesOfTalent = new Map<string | null, string[]>();
    for (const l of linkRows) {
      const n = agencyById.get(l.agency_id)?.name;
      if (!n) continue;
      agenciesOfTalent.set(l.talent_user_id, [
        ...(agenciesOfTalent.get(l.talent_user_id) ?? []),
        n,
      ]);
    }
    const memberAgency = new Map<string, string>(
      check(members).map((m) => [m.user_id, m.agency_id]),
    );
    const profiles = new Map<
      string,
      Pick<Tables<"profiles">, "id" | "email" | "display_name" | "first_name" | "last_name">
    >();
    const memberIds = [...new Set(check(members).map((m) => m.user_id))].filter((id) =>
      inScope(agencyById.get(memberAgency.get(id) ?? "")?.is_test),
    );
    if (memberIds.length) {
      const p = check(
        await admin
          .from("profiles")
          .select("id, email, display_name, first_name, last_name")
          .in("id", memberIds),
      );
      for (const r of p) profiles.set(r.id, r);
    }
    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const admins = new Set((adminRoles ?? []).map((r) => r.user_id));
    const people: TermsPerson[] = [
      ...talentRows
        .filter((t) => t.user_id && !admins.has(t.user_id))
        .map((t) => ({
          // The preceding truthy filter excludes null without declaring a type guard.
          user_id: t.user_id as string,
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
          return {
            user_id: id,
            name: name ?? "",
            email: p?.email ?? "",
            docType: "agency" as const,
            segment: null,
          };
        }),
    ];
    const peopleFiltered = people.filter(
      (p) =>
        (data.type === "all" || p.docType === data.type) &&
        (data.segment === "all" || p.docType !== "talent" || p.segment === data.segment),
    );
    const accRows = check(acc);
    const currentDocs = check(docs);
    const currentIds = new Set<string | null>(currentDocs.map((d) => d.id));
    const outstanding = termsOutstanding(
      peopleFiltered,
      // Preserve legacy nullable document IDs; the reporting helper declares a non-null contract.
      accRows as ((typeof accRows)[number] & { document_id: string })[],
      currentDocs,
    );
    const scopedUsers = new Set<string | null>([...talentRows.map((t) => t.user_id), ...memberIds]);
    const accInRange = accRows
      .filter((a) => scopedUsers.has(a.user_id))
      .filter((a) => a.accepted_at >= range.fromIso && a.accepted_at <= range.toIso)
      .filter((a) => data.type === "all" || a.doc_type === data.type)
      .map((a) => ({ ...a, is_current: currentIds.has(a.document_id) }));

    const page = <T>(rows: T[], offset: number) => rows.slice(offset, offset + data.limit);

    // Raw records behind each card: same filters, so row counts equal the card figures.
    const inviteByEmail = new Map<string, InviteRow>();
    for (const i of invites)
      if (i.type === "talent" && !inviteByEmail.has(i.email)) inviteByEmail.set(i.email, i);
    const recordTalent = talentRows
      .filter((t) => inLaunchWindow(t.activation_completed_at, settings))
      .map((t) => {
        const inv = inviteByEmail.get(
          String(t.email ?? "")
            .trim()
            .toLowerCase(),
        );
        const ags = agenciesOfTalent.get(t.user_id) ?? [];
        return {
          id: t.user_id,
          name: t.full_name ?? "",
          email: t.email ?? "",
          type: "talent" as const,
          is_test: !!t.is_test,
          agency: ags.length ? ags.join(", ") : "Independent",
          invited_at: inv?.first_sent_at ?? inv?.created_at ?? null,
          signed_up_at: t.activation_completed_at,
          status: "active",
          offer_place: inv ? (placeById.get(inv.id) ?? null) : null,
        };
      });
    const recordAgencies = agencyAcc
      .filter((a) => inLaunchWindow(a.accepted_at, settings))
      .map((a) => {
        const ag = a.agency_id ? agencyById.get(a.agency_id) : null;
        return {
          id: a.id,
          name: ag?.name ?? a.agency_name ?? "",
          email: a.email ?? "",
          type: "agency" as const,
          is_test: !!ag?.is_test,
          agency: null,
          invited_at: a.first_sent_at ?? a.created_at,
          signed_up_at: a.accepted_at,
          status: ag?.status ?? "accepted",
          offer_place: placeById.get(a.id) ?? null,
        };
      });
    const recordInvites = scopedInvites
      .filter((r) => matchesInviteFilter(r, { ...range, type: data.type, segment: data.segment }))
      .map((r) => ({
        id: r.id,
        name: r.name ?? "",
        email: r.email,
        type: r.type,
        is_test: !!r.is_test,
        agency:
          r.type === "talent"
            ? r.segment === "independent"
              ? "Independent"
              : "Agency-linked"
            : null,
        invited_at: r.first_sent_at ?? r.created_at,
        signed_up_at: r.accepted_at,
        status: inviteBucket(r, nowIso),
        offer_place: placeById.get(r.id) ?? null,
      }));

    return {
      generatedAt: nowIso,
      settings,
      progress,
      records: { talent: recordTalent, agencies: recordAgencies, invitations: recordInvites },
      offer: {
        talent: {
          places: offer.talent.places,
          allocated: offer.talent.allocated,
          used: offer.talent.used,
        },
        agency: {
          places: offer.agency.places,
          allocated: offer.agency.allocated,
          used: offer.agency.used,
        },
        total: offerRows.length,
        rows: page(offerRows, data.offerOffset),
        notRecordedSentBefore: invites.filter((i) => i.status !== "draft" && !i.first_sent_at)
          .length,
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
