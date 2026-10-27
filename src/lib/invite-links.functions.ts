import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInput } from "@/lib/admin.functions";
import { requireInviteLink } from "@/lib/brand-email";

/**
 * Builds the absolute invitation link for "Copy invite link" from the
 * validated server setting PUBLIC_SITE_URL. The caller already holds the
 * token; this only adds the configured origin, so it reveals nothing new.
 * Fails with a plain-language message when the setting is missing.
 */
export const getInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      z.object({
        kind: z.enum(["agency", "talent", "admin"]),
        token: z
          .string()
          .trim()
          .min(8)
          .max(200)
          .regex(/^[A-Za-z0-9_-]+$/),
      }),
      d,
    ),
  )
  .handler(async ({ data }) => ({ url: requireInviteLink(data.kind, data.token) }));
