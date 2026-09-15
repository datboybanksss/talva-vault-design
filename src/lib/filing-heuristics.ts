/**
 * Filename-based filing heuristics.
 *
 * No AI service is wired up yet, so nothing may claim to be an AI suggestion
 * unless something was genuinely inferred. This module inspects the uploaded
 * file's name only, and returns null when it has nothing to go on — callers
 * then fall back to a neutral "Default folder" label.
 */

export type HeuristicSuggestion = {
  folder_id: string | null;
  expiry_date: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
  folder_source_text: string | null;
  expiry_source_text: string | null;
};

type CatalogItem = { id: string; label: string };

/** Keyword → folder-name fragments we try to match against the live catalogue. */
const KEYWORD_RULES: { keywords: string[]; folderHints: string[]; label: string }[] = [
  { keywords: ["passport", "visa", "permit"], folderHints: ["travel", "visa", "identity"], label: "travel or identity" },
  { keywords: ["id", "identity", "idcard", "id-card", "birth"], folderHints: ["identity", "personal"], label: "identity" },
  { keywords: ["contract", "agreement", "addendum", "nda"], folderHints: ["contract", "agreement"], label: "contracts" },
  { keywords: ["invoice", "quote", "statement", "payslip", "bank", "tax", "irp5", "vat"], folderHints: ["bank", "tax", "financial", "invoice"], label: "banking or tax" },
  { keywords: ["licence", "license", "certificate", "certified", "compliance"], folderHints: ["licence", "rights", "compliance"], label: "licences or compliance" },
  { keywords: ["insurance", "medical", "health"], folderHints: ["medical", "health", "insurance"], label: "medical or insurance" },
  { keywords: ["sponsor", "endorsement", "brand", "media"], folderHints: ["brand", "sponsor", "media"], label: "brand or sponsorship" },
];

function normalise(value: string) {
  return value.toLowerCase().replace(/[_\-.]+/g, " ");
}

/** Pull a plausible expiry date (YYYY-MM-DD) out of a filename. */
export function detectExpiryInName(fileName: string): { date: string; matched: string } | null {
  const text = fileName;

  // 2027-08-14 / 2027_08_14
  const iso = text.match(/(20\d{2})[-_/.](0[1-9]|1[0-2])[-_/.](0[1-9]|[12]\d|3[01])/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, matched: iso[0] };

  // 14-08-2027 / 14.08.2027
  const dmy = text.match(/(0[1-9]|[12]\d|3[01])[-_/.](0[1-9]|1[0-2])[-_/.](20\d{2})/);
  if (dmy) return { date: `${dmy[3]}-${dmy[2]}-${dmy[1]}`, matched: dmy[0] };

  return null;
}

/**
 * Derive a suggestion from the filename alone. Returns null when neither a
 * folder nor an expiry could be inferred — in that case the caller must not
 * present anything as an AI suggestion.
 */
export function suggestFromFileName(
  fileName: string,
  catalog: CatalogItem[],
): HeuristicSuggestion | null {
  const name = normalise(fileName);
  const words = new Set(name.split(/\s+/).filter(Boolean));

  let folderId: string | null = null;
  let folderReason = "";
  let matchedKeyword = "";

  for (const rule of KEYWORD_RULES) {
    const hit = rule.keywords.find((k) => words.has(k) || name.includes(k));
    if (!hit) continue;
    const match = catalog.find((c) => {
      const label = c.label.toLowerCase();
      return rule.folderHints.some((h) => label.includes(h));
    });
    if (match) {
      folderId = match.id;
      matchedKeyword = hit;
      folderReason = `The filename mentions "${hit}", which matches your ${rule.label} folder.`;
      break;
    }
  }

  const expiry = detectExpiryInName(fileName);

  if (!folderId && !expiry) return null;

  const confidence: HeuristicSuggestion["confidence"] =
    folderId && expiry ? "high" : folderId ? "medium" : "low";

  return {
    folder_id: folderId,
    expiry_date: expiry?.date ?? null,
    confidence,
    rationale: [folderReason, expiry ? `A date "${expiry.matched}" in the filename was read as the expiry.` : ""]
      .filter(Boolean)
      .join(" "),
    folder_source_text: folderId ? `Filename keyword: "${matchedKeyword}" in ${fileName}` : null,
    expiry_source_text: expiry ? `Filename date: "${expiry.matched}" in ${fileName}` : null,
  };
}
