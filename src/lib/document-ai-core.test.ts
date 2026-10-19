import { describe, it, expect, vi } from "vitest";
import {
  advanceAnalysis,
  applyAiPreferenceChange,
  canAnalyseWithAi,
  checkAiSources,
  mapFolderToCatalogue,
  type AnalysisRow,
} from "./document-ai-core";

const row = (status: AnalysisRow["status"], extra: Partial<AnalysisRow> = {}): AnalysisRow => ({
  status,
  suggestion: null,
  error_code: null,
  provider_ref: null,
  updated_at: new Date().toISOString(),
  ...extra,
});

function deps(aiEnabled: boolean) {
  return {
    aiEnabled: vi.fn(async () => aiEnabled),
    claim: vi.fn(async () => true),
    save: vi.fn(async () => {}),
    analyse: vi.fn(async () => ({
      status: "completed" as const,
      suggestion: { folder_id: "f1", expiry_date: "2030-01-01", reminder_lead_days: 30 },
    })),
    poll: vi.fn(async () => ({ status: "processing" as const, providerRef: "r1" })),
  };
}

describe("document AI — switch off", () => {
  it("never calls the analysis adapter when the switch is off", async () => {
    const d = deps(false);
    const next = await advanceAnalysis(row("queued"), d);
    expect(d.analyse).not.toHaveBeenCalled();
    expect(next.status).toBe("skipped_opted_out");
  });

  it("calls the adapter once when the switch is on", async () => {
    const d = deps(true);
    const next = await advanceAnalysis(row("queued"), d);
    expect(d.analyse).toHaveBeenCalledTimes(1);
    expect(next.status).toBe("completed");
  });

  it("stops polling an async job once the person opts out", async () => {
    const d = deps(false);
    const next = await advanceAnalysis(row("processing", { provider_ref: "r1" }), d);
    expect(d.poll).not.toHaveBeenCalled();
    expect(next.status).toBe("skipped_opted_out");
  });

  it("treats an adapter crash as failed, not as a thrown error", async () => {
    const d = deps(true);
    d.analyse.mockRejectedValueOnce(new Error("boom"));
    const next = await advanceAnalysis(row("queued"), d);
    expect(next).toMatchObject({ status: "failed", error_code: "adapter_error" });
  });
});

describe("document AI — opting out", () => {
  it("cancels queued analyses and audits when switched off", async () => {
    const audit = vi.fn(async () => {});
    const cancelQueued = vi.fn(async () => {});
    await applyAiPreferenceChange(false, { audit, cancelQueued });
    expect(audit).toHaveBeenCalledWith(false);
    expect(cancelQueued).toHaveBeenCalledTimes(1);
  });

  it("audits but cancels nothing when switched on", async () => {
    const audit = vi.fn(async () => {});
    const cancelQueued = vi.fn(async () => {});
    await applyAiPreferenceChange(true, { audit, cancelQueued });
    expect(audit).toHaveBeenCalledWith(true);
    expect(cancelQueued).not.toHaveBeenCalled();
  });
});

describe("document AI — 'ai' source rule", () => {
  const base = {
    aiEnabled: true,
    folderSource: "ai",
    expirySource: "ai",
    destination: "f1",
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
  const completed = {
    status: "completed" as const,
    suggestion: { folder_id: "f1", expiry_date: "2030-01-01", reminder_lead_days: 30 },
  };

  it("refuses 'ai' without a completed analysis", () => {
    expect(checkAiSources({ ...base, analysis: null })).toMatch(/No completed AI analysis/);
    expect(checkAiSources({ ...base, analysis: { status: "processing", suggestion: null } })).toMatch(/No completed/);
  });
  it("refuses 'ai' when the value differs from what the analysis returned", () => {
    expect(checkAiSources({ ...base, destination: "f2", analysis: completed })).toMatch(/folder/);
    expect(checkAiSources({ ...base, expiresAt: "2031-01-01T00:00:00.000Z", analysis: completed })).toMatch(/expiry/);
  });
  it("refuses 'ai' when the switch is off", () => {
    expect(checkAiSources({ ...base, aiEnabled: false, analysis: completed })).toMatch(/switched off/);
  });
  it("accepts matching values from a completed analysis", () => {
    expect(checkAiSources({ ...base, analysis: completed })).toBeNull();
  });
  it("accepts 'user' and 'filename' sources without any analysis", () => {
    expect(checkAiSources({ ...base, folderSource: "user", expirySource: "filename", analysis: null })).toBeNull();
  });
});

describe("document AI — Analyse with AI action", () => {
  it("appears only when the switch is on and the document is pending", () => {
    expect(canAnalyseWithAi(true, true)).toBe(true);
    expect(canAnalyseWithAi(false, true)).toBe(false);
    expect(canAnalyseWithAi(true, false)).toBe(false);
    expect(canAnalyseWithAi(undefined, true)).toBe(false);
  });
});

describe("document AI — catalogue mapping", () => {
  const cat = [
    { id: "a", label: "Identity" },
    { id: "b", label: "Identity → Passports" },
  ];
  it("maps by id, label or unique leaf name and never invents a folder", () => {
    expect(mapFolderToCatalogue("b", cat)).toBe("b");
    expect(mapFolderToCatalogue("identity → passports", cat)).toBe("b");
    expect(mapFolderToCatalogue("Passports", cat)).toBe("b");
    expect(mapFolderToCatalogue("Medical", cat)).toBeNull();
  });
});
