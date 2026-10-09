/** Central display vocabulary; legacy database names and share URLs stay unchanged. */
export const SHARE_TERM = "trusted contact";
export const SHARE_TERM_PLURAL = "trusted contacts";
export const SHARE_TERM_CAPITALISED = "Trusted contact";
export const SHARE_TERM_PLURAL_CAPITALISED = "Trusted contacts";
export const SHARE_RECIPIENT_TERM = SHARE_TERM;
export const SHARE_RECIPIENT_TERM_PLURAL = SHARE_TERM_PLURAL;
export const SHARE_RECIPIENT_TERM_CAPITALISED = SHARE_TERM_CAPITALISED;
export const SHARE_RECIPIENT_TERM_PLURAL_CAPITALISED = SHARE_TERM_PLURAL_CAPITALISED;

/** Relationship options offered when a talent creates a share. */
export const SHARE_RELATIONSHIP_OPTIONS = [
  "Family",
  "Partner",
  "Banker",
  "Financial adviser",
  "Accountant",
  "Legal adviser",
  "School or university",
  "Other",
] as const;

/**
 * Future-tier hook. Every talent is on the standard tier today; nothing reads
 * this beyond passing it through, so tiers can be introduced later without
 * reshaping the talent context.
 */
export type TalentTier = "standard";
export const DEFAULT_TALENT_TIER: TalentTier = "standard";

/** Minimum age for activating a TalVault account. */
export const MINIMUM_TALENT_AGE = 18;

export function ageOn(dobIso: string, at = new Date()): number {
  const d = new Date(dobIso + (dobIso.length === 10 ? "T00:00:00Z" : ""));
  let age = at.getUTCFullYear() - d.getUTCFullYear();
  const m = at.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

export const UNDER_AGE_MESSAGE =
  "TalVault is for adults (18 and over) at this stage. Please contact the person who invited you.";
