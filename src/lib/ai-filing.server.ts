/**
 * AI-assisted document filing — gateway helper (server only).
 *
 * Sends the uploaded file (image or PDF) to the Lovable AI Gateway and asks for
 * a filing suggestion constrained to a closed catalog of allowed destinations.
 * Never throws for model/gateway problems: callers get a null suggestion and the
 * UI degrades to manual filing.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

/** Hard limits — anything outside these skips the AI call entirely. */
export const MAX_AI_FILE_BYTES = 15 * 1024 * 1024;

export type CatalogOption = {
  /** Stable id we map the answer back onto (folder uuid, or folder name for agency). */
  id: string;
  /** Human label shown to the model and the user, e.g. "Personal -> Passport". */
  label: string;
};

export type FilingSuggestion = {
  folder_id: string | null;
  folder_label: string | null;
  doc_type: string | null;
  confidence: "high" | "medium" | "low" | null;
  expiry_date: string | null;
  reminder_lead_days: number | null;
  rationale: string | null;
};

export function isAiReadableFile(mime: string | null | undefined, size: number | null | undefined) {
  if (size != null && size > MAX_AI_FILE_BYTES) return false;
  if (!mime) return false;
  const m = mime.toLowerCase();
  if (m === "application/pdf") return true;
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png" || m === "image/webp";
}

function buildPrompt(catalog: CatalogOption[], fileName: string) {
  const today = new Date().toISOString().slice(0, 10);
  const list = catalog.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
  return [
    "You are a document filing assistant for a personal/agency document vault.",
    "Inspect the attached document and reply with json only.",
    "",
    `Today's date is ${today}. The uploaded file name is "${fileName}".`,
    "",
    "Choose the single best destination from this fixed catalog. You may ONLY answer with a",
    "label copied exactly from this list, or null if nothing fits:",
    list,
    "",
    "Return a json object with exactly these keys:",
    '  "folder_label": exact label from the catalog above, or null',
    '  "doc_type": short human name for the document (e.g. "Passport", "Medical aid certificate"), or null',
    '  "confidence": "high", "medium" or "low"',
    '  "expiry_date": the document\'s expiry/valid-until date as YYYY-MM-DD, or null if the document has no expiry',
    '  "reminder_lead_days": how many days before expiry the owner should be reminded (integer), or null',
    '  "rationale": one short sentence explaining the choice',
    "",
    "Rules: never invent an expiry date — only report one printed on the document.",
    "For identity documents suggest a 90 day reminder lead, for insurance/medical 30 days,",
    "for tax and compliance documents 60 days.",
  ].join("\n");
}

export async function requestFilingSuggestion(opts: {
  apiKey: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
  catalog: CatalogOption[];
}): Promise<FilingSuggestion | null> {
  if (opts.catalog.length === 0) return null;

  const base64 = Buffer.from(opts.bytes).toString("base64");
  const isPdf = opts.mimeType.toLowerCase() === "application/pdf";

  const filePart = isPdf
    ? {
        type: "file",
        file: {
          filename: opts.fileName,
          file_data: `data:${opts.mimeType};base64,${base64}`,
        },
      }
    : {
        type: "image_url",
        image_url: { url: `data:${opts.mimeType};base64,${base64}` },
      };

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": opts.apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: buildPrompt(opts.catalog, opts.fileName) }, filePart],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[ai-filing] gateway request failed", err);
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-filing] gateway error", res.status, detail.slice(0, 400));
    if (res.status === 429) throw new Error("AI_RATE_LIMITED");
    if (res.status === 402) throw new Error("AI_CREDITS_EXHAUSTED");
    return null;
  }

  let raw: string | undefined;
  try {
    const json = (await res.json()) as any;
    raw = json?.choices?.[0]?.message?.content;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  return normalizeSuggestion(parsed, opts.catalog);
}

export function normalizeSuggestion(parsed: any, catalog: CatalogOption[]): FilingSuggestion {
  const label = typeof parsed?.folder_label === "string" ? parsed.folder_label.trim() : null;
  // Only accept labels that exist in the closed catalog.
  const match =
    label != null
      ? catalog.find((c) => c.label.toLowerCase() === label.toLowerCase()) ?? null
      : null;

  const expiryRaw = typeof parsed?.expiry_date === "string" ? parsed.expiry_date.trim() : null;
  const expiry = expiryRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : null;

  const leadRaw = parsed?.reminder_lead_days;
  let lead: number | null = null;
  if (typeof leadRaw === "number" && Number.isFinite(leadRaw)) lead = Math.round(leadRaw);
  else if (typeof leadRaw === "string" && /^\d+$/.test(leadRaw.trim())) lead = parseInt(leadRaw, 10);
  if (lead != null) lead = Math.min(Math.max(lead, 1), 365);

  const conf = typeof parsed?.confidence === "string" ? parsed.confidence.toLowerCase() : null;

  return {
    folder_id: match?.id ?? null,
    folder_label: match?.label ?? null,
    doc_type: typeof parsed?.doc_type === "string" ? parsed.doc_type.trim().slice(0, 120) : null,
    confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : null,
    expiry_date: expiry,
    reminder_lead_days: lead,
    rationale:
      typeof parsed?.rationale === "string" ? parsed.rationale.trim().slice(0, 300) : null,
  };
}
