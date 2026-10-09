import { sendLovableEmail } from "@lovable.dev/email-js";

type SendResult =
  | { sent: true; message_id?: string }
  | { sent: false; reason: "email_not_configured" | "domain_unverified" | "send_failed"; detail?: string };

/**
 * Real send through the Lovable Emails integration. Returns a structured
 * failure (instead of throwing) so the UI can surface an honest message while
 * the sender domain is still pending verification.
 */
export async function sendInvitationEmail(
  to: string,
  mail: { subject: string; html: string; text: string },
  idempotencyKey?: string,
  label:
    | "agency_invitation"
    | "talent_invitation"
    | "admin_invitation"
    | "talent_reminder"
    | "sign_in_code"
    | "loved_one_share"
    | "independent_talent_invitation"
    | "invitation_notice"
    | "link_request"
    | "link_response"
    | "relationship_ended" = "agency_invitation",
): Promise<SendResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { sent: false, reason: "email_not_configured" };

  const from = process.env["EMAIL_FROM"] ?? "TalVault <invitations@notify.talvault.com>";
  const senderDomain = (from.match(/@([^>\s]+)/)?.[1] ?? "notify.talvault.com").trim();

  const key = idempotencyKey ?? `${label}-${to}-${Date.now()}`;


  try {
    const res = await sendLovableEmail(
      {
        to,
        from,
        sender_domain: senderDomain,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        label,
        purpose: "transactional",
        idempotency_key: key,
      },
      { apiKey, idempotencyKey: key },
    );
    if (!res.success) return { sent: false, reason: "send_failed", detail: res.status };
    return { sent: true, message_id: res.message_id };
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : undefined;
    const detail = String(e?.message ?? e);
    const domainIssue =
      status === 403 ||
      /domain|verif|not allowed|sender/i.test(detail);
    return {
      sent: false,
      reason: domainIssue ? "domain_unverified" : "send_failed",
      detail,
    };
  }
}

/**
 * For an invitation that must never be delivered (inert): report the outcome a
 * real invitation send would most likely have had right now, so the agency sees
 * the same result. Mirrors the latest real agency talent invitation.
 */
export async function simulatedInvitationSend(): Promise<SendResult> {
  if (!process.env["LOVABLE_API_KEY"]) return { sent: false, reason: "email_not_configured" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inert } = await (supabaseAdmin as any).from("talent_invite_private").select("invitation_id").eq("kind", "inert");
  const skip = new Set(((inert ?? []) as any[]).map((r) => r.invitation_id));
  const { data: recent } = await supabaseAdmin
    .from("talent_invitations")
    .select("id, email_sent_at")
    .order("created_at", { ascending: false })
    .limit(25);
  const last = ((recent ?? []) as any[]).find((r) => !skip.has(r.id));
  return last?.email_sent_at ? { sent: true } : { sent: false, reason: "domain_unverified" };
}
