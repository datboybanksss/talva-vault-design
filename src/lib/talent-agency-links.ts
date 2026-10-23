import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTalentAgencyLinks } from "@/lib/talent.functions";

/**
 * The one client-side source of a talent's agency links (name, logo, manager,
 * status, dates, shared count). Every Talent screen reads agency status from
 * here; none works it out on its own. A failed read is an error, never
 * "independent".
 */
export const TALENT_AGENCY_LINKS_KEY = ["talent", "agency-links"] as const;

export function useTalentAgencyLinks() {
  const load = useServerFn(getTalentAgencyLinks);
  return useQuery(
    queryOptions({
      queryKey: TALENT_AGENCY_LINKS_KEY,
      queryFn: () => load(),
      staleTime: 60_000,
      retry: 1,
    }),
  );
}

export type TalentAgencyLink = NonNullable<
  ReturnType<typeof useTalentAgencyLinks>["data"]
>["relationships"][number];
