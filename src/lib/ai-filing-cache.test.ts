import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { syncAiFilingPreference } from "./ai-filing-cache";
it("every switch change synchronises the preference and catalogues and drops stale analyses", async () => {
  const qc = new QueryClient();
  const key = ["filing-analysis", "talent", "doc"];
  qc.setQueryData(key, { status: "completed", suggestion: { folder_id: "old" } });
  qc.setQueryData(["filing-review", "talent", "doc"], { aiEnabled: true, catalog: [] });
  await syncAiFilingPreference(qc, false);
  expect(qc.getQueryData(key)).toBeUndefined();
  expect(qc.getQueryData(["ai-filing-preference"])).toEqual({ aiEnabled: false });
  expect(qc.getQueryData(["filing-review", "talent", "doc"])).toMatchObject({ aiEnabled: false });
  qc.setQueryData(key, { status: "completed", suggestion: { folder_id: "old" } });
  await syncAiFilingPreference(qc, true);
  expect(qc.getQueryData(key)).toBeUndefined();
  expect(qc.getQueryData(["ai-filing-preference"])).toEqual({ aiEnabled: true });
});
