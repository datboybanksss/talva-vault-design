import { createFileRoute } from "@tanstack/react-router";

// Scheduled reminder scan. Called by pg_cron; /api/public/* bypasses site auth,
// so the caller is verified with the project publishable key here.
export const Route = createFileRoute("/api/public/hooks/talent-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key =
          request.headers.get("apikey") ||
          (request.headers.get("authorization") ?? "").replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!key || !expected || key !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
          console.error("[talent-reminders]", e?.message);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "scan failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
