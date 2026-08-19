/**
 * Platform folder taxonomy for agency-managed (shared) talent folders.
 *
 * This is the single source of truth for the 10 categories. Per-agency
 * overrides live in `agency_folder_settings` — never hardcode an agency's
 * configuration here; these are only the platform recommendations used as the
 * baseline and by "Reset to recommended folders".
 */

export type FolderCategory = {
  name: string;
  /** Pre-ticked for new talent profiles unless the agency says otherwise. */
  recommended: boolean;
  aiFilingAllowed: boolean;
  defaultValidityRule: string;
  canUntickDuringOnboarding: boolean;
};

export const FOLDER_CATEGORIES: FolderCategory[] = [
  {
    name: "Identity & Personal",
    recommended: true,
    aiFilingAllowed: true,
    defaultValidityRule: "Based on document expiry",
    canUntickDuringOnboarding: false,
  },
  {
    name: "Contracts & Agreements",
    recommended: true,
    aiFilingAllowed: true,
    defaultValidityRule: "Based on document expiry",
    canUntickDuringOnboarding: false,
  },
  {
    name: "Banking, Tax & Financial",
    recommended: true,
    aiFilingAllowed: true,
    defaultValidityRule: "5 years",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Travel & Visas",
    recommended: true,
    aiFilingAllowed: true,
    defaultValidityRule: "Based on document expiry",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Medical, Fitness & Insurance",
    recommended: false,
    aiFilingAllowed: true,
    defaultValidityRule: "1 year",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Career & Professional Records",
    recommended: false,
    aiFilingAllowed: true,
    defaultValidityRule: "No expiry unless document indicates one",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Brand, Sponsorship & Media",
    recommended: false,
    aiFilingAllowed: true,
    defaultValidityRule: "Based on document expiry",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Bookings, Events & Appearances",
    recommended: false,
    aiFilingAllowed: true,
    defaultValidityRule: "3 years",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Rights, Licences & Compliance",
    recommended: false,
    aiFilingAllowed: true,
    defaultValidityRule: "Based on document expiry",
    canUntickDuringOnboarding: true,
  },
  {
    name: "Other Documents",
    recommended: false,
    aiFilingAllowed: false,
    defaultValidityRule: "No expiry unless document indicates one",
    canUntickDuringOnboarding: true,
  },
];

export const FOLDER_NAMES = FOLDER_CATEGORIES.map((f) => f.name);

export const VALIDITY_RULE_PRESETS = [
  "No expiry unless document indicates one",
  "Based on document expiry",
  "1 year",
  "3 years",
  "5 years",
  "7 years",
];

export function baselineFor(name: string): FolderCategory | undefined {
  return FOLDER_CATEGORIES.find((f) => f.name === name);
}

/** Best-effort mapping from the legacy ad hoc folder names to the taxonomy. */
export const LEGACY_FOLDER_MAP: Record<string, string> = {
  "ID Documents": "Identity & Personal",
  "Certified Documents": "Rights, Licences & Compliance",
  Compliance: "Rights, Licences & Compliance",
  Contracts: "Contracts & Agreements",
  Tax: "Banking, Tax & Financial",
  "Proof of Accounts": "Banking, Tax & Financial",
  Invoices: "Banking, Tax & Financial",
  Travel: "Travel & Visas",
  Sponsorships: "Brand, Sponsorship & Media",
  Endorsements: "Brand, Sponsorship & Media",
  Property: "Other Documents",
  Other: "Other Documents",
};
