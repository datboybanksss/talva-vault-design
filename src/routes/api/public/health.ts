import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness/readiness probe. Deliberately returns no environment details,
 * version strings, or database contents — it only confirms the Worker is
 * serving and that the database answers a trivial query.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        let database: "ok" | "unreachable" = "ok";
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("agencies")
            .select("id", { head: true, count: "exact" })
            .limit(1);
          if (error) database = "unreachable";
        } catch {
          database = "unreachable";
        }

        const body = { status: database === "ok" ? "ok" : "degraded", database };
        return new Response(JSON.stringify(body), {
          status: database === "ok" ? 200 : 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
