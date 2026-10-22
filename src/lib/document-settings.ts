/** TalVault-wide document rules, set only by administrators. null = not set yet. */
export type DocumentSettings = {
  min_retention_years: number | null;
  recovery_days: number | null;
  bulk_delete_threshold: number | null;
  bulk_delete_window_minutes: number | null;
};

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export function parseDocumentSettings(v: unknown): DocumentSettings {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    min_retention_years: toInt(o.min_retention_years),
    recovery_days: toInt(o.recovery_days),
    bulk_delete_threshold: toInt(o.bulk_delete_threshold),
    bulk_delete_window_minutes: toInt(o.bulk_delete_window_minutes),
  };
}

/** Rule-check used by the server before saving an agency retention rule. */
export function retentionBelowMinimum(years: number, min: number | null): string | null {
  return min !== null && years < min
    ? `TalVault's minimum retention period is ${min} ${min === 1 ? "year" : "years"}, so rules can't be shorter.`
    : null;
}

export function stopSharingConfirmText(talentName: string | null): string {
  const who = talentName && talentName !== "Unassigned" ? talentName : "The talent";
  return `${who} will keep access to this document because it has already been shared with them.`;
}
