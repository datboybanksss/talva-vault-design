/**
 * Folder taxonomy helpers.
 *
 * The taxonomy itself (categories, subfolders, talent-type templates) lives in
 * the database and is read through `@/lib/folder-catalogue`. Only presentation
 * presets and the legacy name mapping live here.
 */

export const VALIDITY_RULE_PRESETS = [
  "No expiry unless document indicates one",
  "Based on document expiry",
  "1 year",
  "3 years",
  "5 years",
  "7 years",
];

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
