import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  parseAcceptTermsInput,
  testUserIds,
  TERMS_RECORD_FAILED_MESSAGE,
  TERMS_UPDATED_MESSAGE,
} from "@/lib/terms-gate-core";

/**
 * Terms & Conditions acceptance: the sign-in gate, each user's own records,
 * and the admin "Terms acceptances" register. Records are append-only and
 * stamped by the database (see legal_acceptances_stamp).
 */

export type TermsPortal = "talent" | "agency";

export type MyAcceptance = {
  id: string;
  doc_type: string;
  version: string;
  accepted_at: string;
  proof_ref: string | null;
  acceptance_method: string | null;
  hash_retrospective: boolean;
};

export type TermsStatus = {
  required: boolean;
  current: {
    id: string;
    version: string;
    title: string;
    body: string;
    body_sha256: string;
    effective_at: string;
  } | null;
  acceptances: MyAcceptance[];
};

const portalInput = z.object({ portal: z.enum(["talent", "agency"]) });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function belongsToPortal(
  sb: SupabaseClient<Database>,
  userId: string,
  portal: TermsPortal,
): Promise<boolean> {
  if (portal === "talent") {
    const { data } = await sb
      .from("talent_profiles")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    return !!data;
  }
  const { data } = await sb
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export const getMyTermsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => portalInput.parse(v))
  .handler(async ({ data, context }): Promise<TermsStatus> => {
    const sb = await admin();
    const userId = context.userId;
    const [{ data: current, error: documentError }, { data: accs, error: acceptanceError }] =
      await Promise.all([
        sb
          .from("legal_documents")
          .select("id, version, title, body, body_sha256, effective_at")
          .eq("doc_type", data.portal)
          .eq("is_current", true)
          .maybeSingle(),
        sb
          .from("legal_acceptances")
          .select(
            "id, doc_type, version, accepted_at, proof_ref, acceptance_method, hash_retrospective, document_id",
          )
          .eq("user_id", userId)
          .order("accepted_at", { ascending: false }),
      ]);
    if (documentError || acceptanceError)
      throw new Error("We couldn't load your Terms & Conditions. Please try again.");
    const inPortal = await belongsToPortal(sb, userId, data.portal);
    const hasCurrent = !!current && (accs ?? []).some((a) => a.document_id === current.id);
    return {
      required: inPortal && !!current && !hasCurrent,
      current: current ?? null,
      acceptances: (accs ?? []).map(({ document_id: _d, ...a }) => a),
    };
  });

export const acceptCurrentTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    try {
      return parseAcceptTermsInput(v);
    } catch (e) {
      console.error("[terms-accept] invalid input");
      throw e;
    }
  })
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: current, error } = await sb
      .from("legal_documents")
      .select("id, body_sha256")
      .eq("doc_type", data.portal)
      .eq("is_current", true)
      .maybeSingle();
    if (error) {
      console.error("[terms-accept] load current failed", error.code);
      throw new Error(TERMS_RECORD_FAILED_MESSAGE);
    }
    if (!current || current.id !== data.document_id || current.body_sha256 !== data.body_sha256) {
      console.error("[terms-accept] document mismatch", data.portal);
      throw new Error(TERMS_UPDATED_MESSAGE);
    }
    if (!(await belongsToPortal(sb, context.userId, data.portal))) {
      console.error("[terms-accept] not a member of portal", data.portal);
      throw new Error(TERMS_RECORD_FAILED_MESSAGE);
    }
    const { recordLegalAcceptance } = await import("@/lib/legal-acceptance.server");
    try {
      return await recordLegalAcceptance({
        userId: context.userId,
        docType: data.portal,
        documentId: current.id,
        method: "reacceptance",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("These Terms have been updated.")) throw new Error(TERMS_UPDATED_MESSAGE);
      console.error("[terms-accept] record failed", data.portal, msg.slice(0, 200));
      throw new Error(TERMS_RECORD_FAILED_MESSAGE);
    }
  });

/** The exact text of a version the caller accepted (admins may read any). */
export const getAcceptedTermsText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ acceptance_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: acc } = await sb
      .from("legal_acceptances")
      .select("user_id, document_id")
      .eq("id", data.acceptance_id)
      .maybeSingle();
    if (!acc || !acc.document_id) throw new Error("Not found");
    if (acc.user_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Not found");
    }
    const { data: doc } = await sb
      .from("legal_documents")
      .select("title, version, doc_type, body, body_sha256, effective_at")
      .eq("id", acc.document_id)
      .maybeSingle();
    if (!doc) throw new Error("Not found");
    return doc;
  });

// ---------------------------------------------------------------- admin ----

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

export type AdminAcceptanceRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  /** true when name/email/role came from the stamp; false = current profile (legacy record). */
  stamped_identity: boolean;
  role: string | null;
  agency_id: string | null;
  agency_name: string | null;
  doc_type: string;
  version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  proof_ref: string | null;
  acceptance_method: string | null;
  hash_retrospective: boolean;
  body_sha256: string | null;
  document_sha256: string | null;
  text_verified: boolean;
};

async function identityMaps(sb: SupabaseClient<Database>, userIds: (string | null)[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0)
    return {
      prof: new Map<string | null, Pick<Tables<"profiles">, "id" | "email" | "display_name">>(),
      talent: new Map<string | null, Pick<Tables<"talent_profiles">, "user_id" | "full_name">>(),
      member: new Map<string, Pick<Tables<"agency_members">, "user_id" | "agency_id" | "role">>(),
      agencies: new Map<string, string>(),
    };
  const [{ data: profs }, { data: tps }, { data: mems }] = await Promise.all([
    sb
      .from("profiles")
      .select("id, email, display_name") // Preserve nullable IDs in this existing filter; eq/in generated signatures exclude null.
      .in("id", ids as string[]),
    sb
      .from("talent_profiles")
      .select("user_id, full_name") // Preserve nullable IDs in this existing filter; generated signatures exclude null.
      .in("user_id", ids as string[]),
    sb
      .from("agency_members")
      .select("user_id, agency_id, role") // Preserve nullable IDs in this existing filter; generated signatures exclude null.
      .in("user_id", ids as string[]),
  ]);
  const agencyIds = [...new Set((mems ?? []).map((m) => m.agency_id))];
  const { data: ags } = agencyIds.length
    ? await sb.from("agencies").select("id, name").in("id", agencyIds)
    : { data: [] };
  return {
    prof: new Map((profs ?? []).map((p) => [p.id, p])),
    talent: new Map((tps ?? []).map((t) => [t.user_id, t])),
    member: new Map((mems ?? []).map((m) => [m.user_id, m])),
    agencies: new Map((ags ?? []).map((a) => [a.id, a.name])),
  };
}

/** Test accounts are left out of every Terms acceptance report. */
async function loadTestUserIds(sb: SupabaseClient<Database>): Promise<Set<string>> {
  const [{ data: tps }, { data: ags }] = await Promise.all([
    sb.from("talent_profiles").select("user_id, is_test").eq("is_test", true),
    sb.from("agencies").select("id").eq("is_test", true),
  ]);
  const agencyIds = (ags ?? []).map((a) => a.id as string);
  const { data: mems } = agencyIds.length
    ? await sb.from("agency_members").select("user_id, agency_id").in("agency_id", agencyIds)
    : { data: [] };
  return testUserIds(tps ?? [], mems ?? [], agencyIds);
}

export const listTermsAcceptances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      rows: AdminAcceptanceRow[];
      versions: { doc_type: string; version: string; is_current: boolean }[];
    }> => {
      await assertAdmin(context);
      const sb = await admin();
      const [{ data: allAccs, error }, { data: docs }] = await Promise.all([
        sb
          .from("legal_acceptances")
          .select("*")
          .order("accepted_at", { ascending: false })
          .limit(5000),
        sb
          .from("legal_documents")
          .select("id, doc_type, version, is_current, body_sha256")
          .order("effective_at"),
      ]);
      if (error) throw databaseError(error);
      const testIds = await loadTestUserIds(sb);
      const accs = (allAccs ?? []).filter((a) => !testIds.has(a.user_id));
      const docHash = new Map((docs ?? []).map((d) => [d.id, d.body_sha256]));
      const maps = await identityMaps(
        sb,
        (accs ?? []).map((a) => a.user_id),
      );
      const extraAgencyIds = (accs ?? [])
        .map((a) => a.agency_id)
        .filter((id: string | null) => id && !maps.agencies.has(id));
      if (extraAgencyIds.length) {
        const { data: ags } = await sb
          .from("agencies")
          .select("id, name") // The existing truthy predicate removes null IDs but does not declare a type guard.
          .in("id", extraAgencyIds as string[]);
        for (const a of ags ?? []) maps.agencies.set(a.id, a.name);
      }
      const rows = (accs ?? []).map((a): AdminAcceptanceRow => {
        const p = maps.prof.get(a.user_id);
        const t = maps.talent.get(a.user_id);
        const m = maps.member.get(a.user_id);
        const stamped = !!a.user_email;
        const fallbackRole =
          a.doc_type === "talent"
            ? "talent"
            : m
              ? m.role === "owner"
                ? "agency_owner"
                : "agency_staff"
              : null;
        const agencyId = a.agency_id ?? (a.doc_type === "agency" ? (m?.agency_id ?? null) : null);
        const document_sha256 = (a.document_id && docHash.get(a.document_id)) ?? null;
        return {
          id: a.id,
          user_id: a.user_id,
          name: a.user_full_name ?? t?.full_name ?? p?.display_name ?? null,
          email: a.user_email ?? p?.email ?? null,
          stamped_identity: stamped,
          role: a.user_role ?? fallbackRole,
          agency_id: agencyId,
          agency_name: agencyId ? (maps.agencies.get(agencyId) ?? null) : null,
          doc_type: a.doc_type,
          version: a.version,
          accepted_at: a.accepted_at,
          ip_address: a.ip_address,
          user_agent: a.user_agent,
          proof_ref: a.proof_ref,
          acceptance_method: a.acceptance_method,
          hash_retrospective: a.hash_retrospective,
          body_sha256: a.body_sha256,
          document_sha256,
          text_verified: !!a.body_sha256 && a.body_sha256 === document_sha256,
        };
      });
      return {
        rows,
        versions: (docs ?? []).map((d) => ({
          doc_type: d.doc_type,
          version: d.version,
          is_current: d.is_current,
        })),
      };
    },
  );

export type NotAcceptedRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  role: "talent" | "agency_owner" | "agency_staff";
  agency_id: string | null;
  agency_name: string | null;
  doc_type: "talent" | "agency";
  current_version: string;
  last_accepted_version: string | null;
};

export const listTermsNotAccepted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotAcceptedRow[]> => {
    await assertAdmin(context);
    const sb = await admin();
    const [{ data: docs }, { data: tps }, { data: mems }, { data: accs }] = await Promise.all([
      sb.from("legal_documents").select("id, doc_type, version").eq("is_current", true),
      sb
        .from("talent_profiles")
        .select("user_id, full_name")
        .not("user_id", "is", null)
        .is("deleted_at", null)
        .eq("is_test", false),
      sb.from("agency_members").select("user_id, agency_id, role"),
      sb
        .from("legal_acceptances")
        .select("user_id, doc_type, version, document_id, accepted_at")
        .order("accepted_at"),
    ]);
    const testIds = await loadTestUserIds(sb);
    const memsReal = (mems ?? []).filter((m) => !testIds.has(m.user_id));
    const current = new Map((docs ?? []).map((d) => [d.doc_type, d]));
    const accepted = new Set((accs ?? []).map((a) => `${a.user_id}:${a.document_id}`));
    const last = new Map<string, string>();
    for (const a of accs ?? []) last.set(`${a.user_id}:${a.doc_type}`, a.version);

    const out: NotAcceptedRow[] = [];
    const talentDoc = current.get("talent");
    const agencyDoc = current.get("agency");
    const maps = await identityMaps(sb, [
      ...(tps ?? []).map((t) => t.user_id),
      ...memsReal.map((m) => m.user_id),
    ]);
    if (talentDoc) {
      for (const t of tps ?? []) {
        if (accepted.has(`${t.user_id}:${talentDoc.id}`)) continue;
        const p = maps.prof.get(t.user_id);
        out.push({
          user_id: t.user_id as string,
          name: t.full_name ?? p?.display_name ?? null,
          email: p?.email ?? null,
          role: "talent",
          agency_id: null,
          agency_name: null,
          doc_type: "talent",
          current_version: talentDoc.version,
          last_accepted_version: last.get(`${t.user_id}:talent`) ?? null,
        });
      }
    }
    if (agencyDoc) {
      const seen = new Set<string>();
      for (const m of memsReal) {
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        if (accepted.has(`${m.user_id}:${agencyDoc.id}`)) continue;
        const p = maps.prof.get(m.user_id);
        out.push({
          user_id: m.user_id,
          name: p?.display_name ?? null,
          email: p?.email ?? null,
          role: m.role === "owner" ? "agency_owner" : "agency_staff",
          agency_id: m.agency_id,
          agency_name: maps.agencies.get(m.agency_id) ?? null,
          doc_type: "agency",
          current_version: agencyDoc.version,
          last_accepted_version: last.get(`${m.user_id}:agency`) ?? null,
        });
      }
    }
    return out;
  });
