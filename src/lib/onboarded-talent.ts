/**
 * Single definition of "onboarded talent", shared by the Admin Overview
 * dashboard and the Admin Reporting page so the two can never diverge.
 *
 * A talent counts as onboarded when ALL of the following hold:
 *  - they have a live link to an agency (`agency_talent_links`)
 *  - that link is attached to a signed-up account (`talent_user_id` is set)
 *  - the link is not revoked
 *  - their talent profile is neither a test record nor soft-deleted
 *
 * Counted once per person, not once per link (a talent may be linked to more
 * than one agency).
 */
export type OnboardedTalent = {
  id: string;
  agency_id: string;
  talent_user_id: string;
  display_name: string;
  status: string;
  created_at: string;
};

/**
 * Every eligible link, without de-duplication — use for per-agency counts,
 * where a talent linked to two agencies should count once for each.
 *
 * @param client  any Supabase client with read access to the two tables
 * @param toIso   optional upper bound on link creation, for period reporting
 */
export async function fetchOnboardedTalentLinks(
  client: any,
  toIso?: string,
): Promise<OnboardedTalent[]> {
  let q = client
    .from("agency_talent_links")
    .select("id, agency_id, talent_user_id, display_name, status, created_at")
    .not("talent_user_id", "is", null)
    .neq("status", "revoked")
    .order("created_at", { ascending: true });
  if (toIso) q = q.lte("created_at", toIso);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const links = (data ?? []) as OnboardedTalent[];
  if (links.length === 0) return [];

  const userIds = [...new Set(links.map((l) => l.talent_user_id))];
  const { data: profiles, error: profErr } = await client
    .from("talent_profiles")
    .select("user_id, is_test, deleted_at")
    .in("user_id", userIds);
  if (profErr) throw new Error(profErr.message);

  // Exclude test and soft-deleted talent. A link whose talent has no profile
  // row yet has not completed onboarding, so it is excluded too.
  const eligible = new Set(
    (profiles ?? [])
      .filter((p: any) => !p.is_test && !p.deleted_at)
      .map((p: any) => p.user_id),
  );
  return links.filter((l) => eligible.has(l.talent_user_id));
}

/** Distinct onboarded people (a talent linked to two agencies counts once). */
export async function fetchOnboardedTalent(
  client: any,
  toIso?: string,
): Promise<OnboardedTalent[]> {
  const links = await fetchOnboardedTalentLinks(client, toIso);
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.talent_user_id)) return false;
    seen.add(l.talent_user_id);
    return true;
  });
}


/** Convenience wrapper for dashboards that only need the headline number. */
export async function countOnboardedTalent(client: any, toIso?: string): Promise<number> {
  return (await fetchOnboardedTalent(client, toIso)).length;
}

export type TalentSplit = { agencyLinked: number; independent: number; total: number };

/**
 * Single definition of the agency-linked / independent split, shared by the
 * Admin Overview dashboard and the Admin Reporting page.
 *
 *  - live talent = a talent profile that is neither a test record nor
 *    soft-deleted (created on or before `toIso` when given)
 *  - agency-linked = live talent with at least one `active` agency link
 *  - independent = live talent with no active agency link
 *
 * Link status is the current status, so period figures are "as of today" for
 * the talent who existed by the end of the period.
 */
export async function fetchTalentSplit(client: any, toIso?: string): Promise<TalentSplit> {
  let pq = client
    .from("talent_profiles")
    .select("user_id")
    .eq("is_test", false)
    .is("deleted_at", null)
    .not("user_id", "is", null);
  if (toIso) pq = pq.lte("created_at", toIso);
  const [{ data: profiles, error: pErr }, { data: links, error: lErr }] = await Promise.all([
    pq,
    client
      .from("agency_talent_links")
      .select("talent_user_id")
      .eq("status", "active")
      .not("talent_user_id", "is", null),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (lErr) throw new Error(lErr.message);
  const linked = new Set((links ?? []).map((l: any) => l.talent_user_id));
  const people = new Set((profiles ?? []).map((p: any) => p.user_id as string));
  let agencyLinked = 0;
  for (const id of people) if (linked.has(id)) agencyLinked += 1;
  return { agencyLinked, independent: people.size - agencyLinked, total: people.size };
}
