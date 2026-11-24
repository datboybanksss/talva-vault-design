import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSignInSummary } from "@/lib/sign-in-metering.functions";
import type { AccountScope } from "@/lib/report-scope";
export function useSignInSummary(from: string, to: string, accounts: AccountScope) {
  const load = useServerFn(getSignInSummary);
  return useQuery({
    queryKey: ["admin", "sign-in-summary", from, to, accounts],
    queryFn: () => load({ data: { from, to, accounts } }),
  });
}
