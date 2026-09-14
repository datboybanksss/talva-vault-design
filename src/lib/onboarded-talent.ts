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
 * @param client  any Supabase client with read access to the two tables
 * @param toIso   optional upper bound on link creation, for period reporting
 */
export async function fetchOnboardedTalent(
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

  const seen = new Set<string>();
  return links.filter((l) => {
    if (!eligible.has(l.talent_user_id)) return false;
    if (seen.has(l.talent_user_id)) return false;
    seen.add(l.talent_user_id);
    return true;
  });
}

/** Convenience wrapper for dashboards that only need the headline number. */
export async function countOnboardedTalent(client: any, toIso?: string): Promise<number> {
  return (await fetchOnboardedTalent(client, toIso)).length;
}
