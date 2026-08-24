import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";

/**
 * Throttling for unauthenticated public endpoints (TVA-SEC-006).
 *
 * Backed by `public.consume_rate_limit`, so counters survive Worker isolate
 * recycling and are shared across edge locations. Mirrors the failed-attempt +
 * hard-lock pattern already used for Loved One access codes, but keyed on the
 * caller IP and on the token being probed, so neither a single IP nor a single
 * token can be brute-forced.
 */

export function callerIp(): string {
  try {
    const h = getRequest()?.headers;
    if (!h) return "unknown";
    return (
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/** Tokens are bearer secrets — never store them raw in the throttle table. */
export function tokenSubject(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export type RateLimitVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

async function consume(
  bucket: string,
  subject: string,
  maxAttempts: number,
  windowSeconds: number,
  blockSeconds?: number,
): Promise<RateLimitVerdict> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    _bucket: bucket,
    _subject: subject,
    _max_attempts: maxAttempts,
    _window_seconds: windowSeconds,
    _block_seconds: blockSeconds ?? undefined,
  });
  if (error) {
    // Fail open rather than lock legitimate users out of activation if the
    // limiter itself is unavailable; the failure is logged for follow-up.
    console.error("rate_limit_error", { bucket, message: error.message });
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    remaining: row?.remaining ?? 0,
    retryAfterSeconds: row?.retry_after_seconds ?? 0,
  };
}

/**
 * Guards a public endpoint on both the caller IP and the supplied token.
 * Returns the first verdict that denies, otherwise an allowing verdict.
 */
export async function guardPublicToken(opts: {
  bucket: string;
  token: string;
  perIp?: { max: number; windowSeconds: number; blockSeconds?: number };
  perToken?: { max: number; windowSeconds: number; blockSeconds?: number };
}): Promise<RateLimitVerdict> {
  const ipCfg = opts.perIp ?? { max: 30, windowSeconds: 600, blockSeconds: 900 };
  const tokenCfg = opts.perToken ?? { max: 10, windowSeconds: 600, blockSeconds: 900 };

  const ip = await consume(
    `${opts.bucket}:ip`,
    callerIp(),
    ipCfg.max,
    ipCfg.windowSeconds,
    ipCfg.blockSeconds,
  );
  if (!ip.allowed) return ip;

  return consume(
    `${opts.bucket}:token`,
    tokenSubject(opts.token),
    tokenCfg.max,
    tokenCfg.windowSeconds,
    tokenCfg.blockSeconds,
  );
}

/** Clears counters after a legitimate success so users aren't punished later. */
export async function clearTokenGuard(bucket: string, token: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("reset_rate_limit", {
    _bucket: `${bucket}:token`,
    _subject: tokenSubject(token),
  });
}

export function throttleMessage(v: RateLimitVerdict): string {
  const mins = Math.max(1, Math.ceil(v.retryAfterSeconds / 60));
  return `Too many attempts. Please wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.`;
}
