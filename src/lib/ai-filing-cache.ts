import type { QueryClient } from "@tanstack/react-query";

/** One preference/cache transition for Settings and the filing popup. */
export async function syncAiFilingPreference(qc: QueryClient, aiEnabled: boolean) {
  await qc.cancelQueries({ queryKey: ["filing-analysis"] });
  qc.removeQueries({ queryKey: ["filing-analysis"] });
  qc.setQueryData(["ai-filing-preference"], { aiEnabled });
  qc.setQueriesData({ queryKey: ["filing-review"] }, (old: unknown) =>
    old && typeof old === "object" ? { ...old, aiEnabled } : old,
  );
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["ai-filing-preference"] }),
    qc.invalidateQueries({ queryKey: ["filing-review"] }),
    qc.invalidateQueries({ queryKey: ["filing-analysis"], refetchType: "none" }),
  ]);
}
