import type { QueryClient } from "@tanstack/react-query";

/** One preference/cache transition for Settings and the filing popup. */
export async function syncAiFilingPreference(qc: QueryClient, aiEnabled: boolean) {
  await qc.cancelQueries({ queryKey: ["filing-analysis"] });
  await qc.resetQueries({ queryKey: ["filing-analysis"], type: "inactive" });
  qc.setQueriesData({ queryKey: ["filing-analysis"] }, () => undefined);
  qc.removeQueries({ queryKey: ["filing-analysis"], type: "inactive" });
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
