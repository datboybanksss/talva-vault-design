import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled reminder scan, invoked daily by pg_cron.
 *
 * `/api/public/*` bypasses site auth, so the caller is verified here against a
 * dedicated high-entropy scheduler secret — NOT the project publishable key,
 * which ships to every browser and is therefore not a secret at all
 * (TVA-SEC-002).
 *
 * Required environment variable: `REMINDER_HOOK_SECRET`.
 * The same value is held in the Supabase vault under `reminder_hook_secret`,
 * which the pg_cron job reads at run time and sends as `x-reminder-secret`.
 * Rotating it means updating BOTH: Project Settings → Secrets, and the vault
 * entry the cron job reads.
 */

/** Length-independent, timing-safe string comparison. */
function secretMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Compare fixed-width digests instead so every path costs the same.
  if (a.length !== b.length) {
    // Still burn a comparison of equal-length buffers to keep timing flat.
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/talent-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.REMINDER_HOOK_SECRET;
        if (!expected) {
          console.error(
            "[talent-reminders] REMINDER_HOOK_SECRET is not configured; refusing all callers.",
          );
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supplied =
          request.headers.get("x-reminder-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");

        if (!supplied || !secretMatches(supplied, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { runTalentReminderScan } = await import("@/lib/talent-reminders.server");
        try {
          const result = await runTalentReminderScan();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          // TVA-SEC-008: full detail server-side only. The caller gets an opaque
          // code it can quote in a support request, never the exception text.
          const ref = crypto.randomUUID();
          console.error("[talent-reminders]", ref, e?.stack ?? e?.message ?? e);
          return new Response(
            JSON.stringify({ ok: false, error: "scan_failed", ref }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
