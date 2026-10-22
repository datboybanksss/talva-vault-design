import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORDING_LIMITS } from "@/lib/invitation-email";

const kindSchema = z.enum(["agency", "talent"]);
const TABLE = { agency: "agency_invitations", talent: "independent_talent_invitations" } as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Only TalVault administrators can do this.");
}

/** Real merge values for the Review email step (link, inviting admin, saved wording). */
export const getAdminInviteEmailContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: row } = await supabase
      .from(TABLE[data.kind])
      .select("token, status, email_subject, email_greeting, email_message")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Invitation not found.");
    const { adminDisplayName, adminInviteUrl } = await import("@/lib/admin-invite-email.server");
    return {
      adminName: await adminDisplayName(supabase, userId),
      inviteUrl: row.token ? await adminInviteUrl(data.kind, row.token) : null,
      saved:
        row.email_subject && row.email_greeting && row.email_message
          ? { subject: row.email_subject, greeting: row.email_greeting, message: row.email_message }
          : null,
    };
  });

/** Saves this draft's edited wording (null = standard wording). Drafts only. */
export const saveAdminInviteWording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        id: z.string().uuid(),
        wording: z
          .object({
            subject: z.string().trim().min(1).max(WORDING_LIMITS.subject),
            greeting: z.string().trim().min(1).max(WORDING_LIMITS.greeting),
            message: z.string().trim().min(1).max(WORDING_LIMITS.message),
          })
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
    if (!canEdit) throw new Error("Your administrator access is view-only.");
    if (data.wording) {
      const { wordingIssues } = await import("@/lib/invitation-email");
      const issues = wordingIssues(data.wording);
      if (issues.length) throw new Error(issues.join(" "));
    }
    const { data: row } = await supabase
      .from(TABLE[data.kind])
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Invitation not found.");
    if (row.status !== "draft")
      throw new Error("This invitation has been sent; its email can no longer be changed.");
    const { error } = await supabase
      .from(TABLE[data.kind])
      .update({
        email_subject: data.wording?.subject ?? null,
        email_greeting: data.wording?.greeting ?? null,
        email_message: data.wording?.message ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't save the email wording. Please try again.");
    return { ok: true };
  });

/** The exact email that was last sent for this invitation, read-only. */
export const getSentAdminInviteEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const nameCol = data.kind === "agency" ? "agency_name" : "talent_name";
    const { data: row } = await supabase
      .from(TABLE[data.kind])
      .select(
        `email, ${nameCol}, sent_email_subject, sent_email_html, sent_email_text, sent_email_at`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Invitation not found.");
    return {
      email: row.email as string,
      name: (row as any)[nameCol] as string,
      subject: row.sent_email_subject as string | null,
      html: row.sent_email_html as string | null,
      text: row.sent_email_text as string | null,
      sentAt: row.sent_email_at as string | null,
    };
  });
