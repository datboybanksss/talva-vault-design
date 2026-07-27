import { createHash, createHmac, timingSafeEqual, randomInt } from "node:crypto";

/** Human-friendly access code alphabet — no ambiguous 0/O/1/I/L. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generates a 10-char access code formatted as XXXXX-XXXXX. */
export function generateAccessCode(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Normalises user input so casing/spaces/dashes don't cause false rejects. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** One-way hash of the code, salted with the share token so hashes aren't portable. */
export function hashAccessCode(code: string, token: string): string {
  return createHash("sha256").update(`${normaliseCode(code)}:${token}`, "utf8").digest("hex");
}

export function accessCodeMatches(input: string, storedHash: string, token: string): boolean {
  const a = Buffer.from(hashAccessCode(input, token), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function ticketSecret(): string {
  const s = process.env.LOVED_ONE_TICKET_SECRET;
  if (!s) throw new Error("LOVED_ONE_TICKET_SECRET is not configured.");
  return s;
}

const TICKET_TTL_MS = 60 * 60 * 1000; // 1 hour of unlocked browsing

/** Signed, short-lived proof that this browser passed the access-code gate. */
export function issueTicket(shareId: string): string {
  const payload = `${shareId}.${Date.now() + TICKET_TTL_MS}`;
  const sig = createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyTicket(ticket: string | undefined | null, shareId: string): boolean {
  if (!ticket) return false;
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return false;
  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const [sid, expStr] = payload.split(".");
  if (sid !== shareId) return false;
  return Number(expStr) > Date.now();
}

export const MAX_FAILED_ATTEMPTS = 8;
