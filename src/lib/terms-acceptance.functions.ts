import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  current: { id: string; version: string; title: string; body: string; effective_at: string } | null;
  acceptances: MyAcceptance[];
};

const portalInput = z.object({ portal: z.enum(["talent", "agency"]) });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function belongsToPortal(sb: any, userId: string, portal: TermsPortal): Promise<boolean> {
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
  const { data } = await sb.from("agency_members").select("agency_id").eq("user_id", userId).limit(1).maybeSingle();
  return !!data;
}

export const getMyTermsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => portalInput.parse(v))
  .handler(async ({ data, context }): Promise<TermsStatus> => {
    const sb = await admin();
    const userId = context.userId;
    const [{ data: current }, { data: accs }] = await Promise.all([
      sb
        .from("legal_documents")
        .select("id, version, title, body, effective_at")
        .eq("doc_type", data.portal)
        .eq("is_current", true)
        .maybeSingle(),
      sb
        .from("legal_acceptances")
        .select("id, doc_type, version, accepted_at, proof_ref, acceptance_method, hash_retrospective, document_id")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false }),
    ]);
    const inPortal = await belongsToPortal(sb, userId, data.portal);
    const hasCurrent = !!current && (accs ?? []).some((a: any) => a.document_id === current.id);
    return {
      required: inPortal && !!current && !hasCurrent,
      current: current ?? null,
      acceptances: (accs ?? []).map(({ document_id: _d, ...a }: any) => a),
    };
  });

export const acceptCurrentTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ portal: z.enum(["talent", "agency"]), document_id: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: current } = await sb
      .from("legal_documents")
      .select("id")
      .eq("doc_type", data.portal)
      .eq("is_current", true)
      .maybeSingle();
    if (!current || current.id !== data.document_id)
      throw new Error("These Terms have been updated. Please reload the page and read the latest version.");
    if (!(await belongsToPortal(sb, context.userId, data.portal)))
      throw new Error("Forbidden");
    const { recordLegalAcceptance } = await import("@/lib/legal-acceptance.server");
    return recordLegalAcceptance({
      userId: context.userId,
      docType: data.portal,
      documentId: current.id,
      method: "reacceptance",
    });
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
    if (!acc) throw new Error("Not found");
    if (acc.user_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) throw new Error("Not found");
    }
    const { data: doc } = await sb
      .from("legal_documents")
      .select("title, version, doc_type, body, body_sha256, effective_at")
      .eq("id", acc.document_id!)
      .maybeSingle();
    if (!doc) throw new Error("Not found");
    return doc;
  });

// ---------------------------------------------------------------- admin ----

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
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

async function identityMaps(sb: any, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { prof: new Map(), talent: new Map(), member: new Map(), agencies: new Map() };
  const [{ data: profs }, { data: tps }, { data: mems }] = await Promise.all([
    sb.from("profiles").select("id, email, display_name").in("id", ids),
    sb.from("talent_profiles").select("user_id, full_name").in("user_id", ids),
    sb.from("agency_members").select("user_id, agency_id, role").in("user_id", ids),
  ]);
  const agencyIds = [...new Set((mems ?? []).map((m: any) => m.agency_id))];
  const { data: ags } = agencyIds.length
    ? await sb.from("agencies").select("id, name").in("id", agencyIds)
    : { data: [] };
  return {
    prof: new Map((profs ?? []).map((p: any) => [p.id, p])),
    talent: new Map((tps ?? []).map((t: any) => [t.user_id, t])),
    member: new Map((mems ?? []).map((m: any) => [m.user_id, m])),
    agencies: new Map((ags ?? []).map((a: any) => [a.id, a.name])),
  };
}

export const listTermsAcceptances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: AdminAcceptanceRow[]; versions: { doc_type: string; version: string; is_current: boolean }[] }> => {
    await assertAdmin(context);
    const sb = await admin();
    const [{ data: accs, error }, { data: docs }] = await Promise.all([
      sb.from("legal_acceptances").select("*").order("accepted_at", { ascending: false }).limit(5000),
      sb.from("legal_documents").select("id, doc_type, version, is_current, body_sha256").order("effective_at"),
    ]);
    if (error) throw new Error(error.message);
    const docHash = new Map((docs ?? []).map((d: any) => [d.id, d.body_sha256]));
    const maps = await identityMaps(sb, (accs ?? []).map((a: any) => a.user_id));
    const extraAgencyIds = (accs ?? [])
      .map((a: any) => a.agency_id)
      .filter((id: string | null) => id && !maps.agencies.has(id));
    if (extraAgencyIds.length) {
      const { data: ags } = await sb.from("agencies").select("id, name").in("id", extraAgencyIds);
      for (const a of ags ?? []) maps.agencies.set(a.id, a.name);
    }
    const rows = (accs ?? []).map((a: any): AdminAcceptanceRow => {
      const p: any = maps.prof.get(a.user_id);
      const t: any = maps.talent.get(a.user_id);
      const m: any = maps.member.get(a.user_id);
      const stamped = !!a.user_email;
      const fallbackRole =
        a.doc_type === "talent" ? "talent" : m ? (m.role === "owner" ? "agency_owner" : "agency_staff") : null;
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
      versions: (docs ?? []).map((d: any) => ({ doc_type: d.doc_type, version: d.version, is_current: d.is_current })),
    };
  });

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
      sb.from("talent_profiles").select("user_id, full_name").not("user_id", "is", null).is("deleted_at", null).eq("is_test", false),
      sb.from("agency_members").select("user_id, agency_id, role"),
      sb.from("legal_acceptances").select("user_id, doc_type, version, document_id, accepted_at").order("accepted_at"),
    ]);
    const current = new Map((docs ?? []).map((d: any) => [d.doc_type, d]));
    const accepted = new Set((accs ?? []).map((a: any) => `${a.user_id}:${a.document_id}`));
    const last = new Map<string, string>();
    for (const a of accs ?? []) last.set(`${a.user_id}:${a.doc_type}`, a.version);

    const out: NotAcceptedRow[] = [];
    const talentDoc: any = current.get("talent");
    const agencyDoc: any = current.get("agency");
    const maps = await identityMaps(sb, [
      ...(tps ?? []).map((t: any) => t.user_id),
      ...(mems ?? []).map((m: any) => m.user_id),
    ]);
    if (talentDoc) {
      for (const t of tps ?? []) {
        if (accepted.has(`${t.user_id}:${talentDoc.id}`)) continue;
        const p: any = maps.prof.get(t.user_id);
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
      for (const m of mems ?? []) {
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        if (accepted.has(`${m.user_id}:${agencyDoc.id}`)) continue;
        const p: any = maps.prof.get(m.user_id);
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
