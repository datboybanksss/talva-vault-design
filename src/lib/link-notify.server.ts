// Server-only: bell notifications + emails for agency ↔ talent link events
// (E5 link request, E6 accepted/declined/cancelled, E7 relationship ended).
// Every send is best effort — while the sending domain is unverified the bell
// and in-app screens carry the message.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildNoticeEmail, fmtLongDate } from "@/lib/notice-email";
import { sendInvitationEmail } from "@/lib/invitation-email.server";
import { PUBLIC_SITE_URL } from "@/lib/brand-email";
import { SHARE_TERM_PLURAL } from "@/lib/terms";

async function loadLink(linkId: string) {
  const { data: link } = await supabaseAdmin
    .from("agency_talent_links")
    .select("id, agency_id, talent_user_id, display_name, request_expires_at, requested_at, ended_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return null;
  const [{ data: agency }, { data: talent }] = await Promise.all([
    supabaseAdmin.from("agencies").select("name, contact_email").eq("id", link.agency_id).maybeSingle(),
    link.talent_user_id
      ? supabaseAdmin.from("talent_profiles").select("email, full_name").eq("user_id", link.talent_user_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  return {
    link,
    agencyName: agency?.name ?? "An agency",
    agencyEmail: (agency?.contact_email as string | null) ?? null,
    talentEmail: (talent?.email as string | null) ?? null,
    talentName: (talent?.full_name as string | null) ?? link.display_name,
  };
}

const first = (n: string) => n.split(" ")[0] || n;

/** E5 — the bell row is written by request_talent_link() itself. */
export async function emailLinkRequest(linkId: string) {
  const ctx = await loadLink(linkId);
  if (!ctx?.talentEmail) return { sent: false };
  const mail = buildNoticeEmail({
    subject: `${ctx.agencyName} would like to connect with your TalVault`,
    preheader: "Review the request in your vault.",
    heading: `A connection request from ${ctx.agencyName}`,
    paragraphs: [
      `Hi ${first(ctx.talentName)},`,
      `Connecting creates a shared folder between you and ${ctx.agencyName}. They will see only what is placed in that shared folder. They will never see your Private Vault, documents shared with your ${SHARE_TERM_PLURAL}, or any other agency's shared folder.`,
      `You can accept or decline in TalVault.${ctx.link.request_expires_at ? ` The request expires on ${fmtLongDate(ctx.link.request_expires_at)}.` : ""}`,
    ],
    ctaLabel: "Review request",
    ctaUrl: `${PUBLIC_SITE_URL}/talent/requests`,
    recipientEmail: ctx.talentEmail,
  });
  const r = await sendInvitationEmail(ctx.talentEmail, mail, `link-request-${linkId}`, "link_request");
  if (r.sent) {
    await supabaseAdmin
      .from("talent_notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("dedupe_key", `link_request:${linkId}`);
  }
  return r;
}

/** E6 to the agency (accepted / declined). */
export async function emailLinkResponse(linkId: string, accepted: boolean) {
  const ctx = await loadLink(linkId);
  if (!ctx?.agencyEmail) return { sent: false };
  const mail = accepted
    ? buildNoticeEmail({
        subject: `${ctx.talentName} accepted your connection request`,
        heading: "Connection accepted",
        paragraphs: ["Their shared folders are ready in your roster."],
        ctaLabel: "Open roster",
        ctaUrl: `${PUBLIC_SITE_URL}/agency/talent`,
        recipientEmail: ctx.agencyEmail,
      })
    : buildNoticeEmail({
        subject: `${ctx.talentName} declined your connection request`,
        heading: "Connection declined",
        paragraphs: ["No access has been granted. You can send a new request after 30 days."],
        recipientEmail: ctx.agencyEmail,
      });
  return sendInvitationEmail(ctx.agencyEmail, mail, `link-response-${linkId}`, "link_response");
}

/** E6 (cancelled) to the talent. */
export async function emailLinkCancelled(linkId: string) {
  const ctx = await loadLink(linkId);
  if (!ctx?.talentEmail) return { sent: false };
  const mail = buildNoticeEmail({
    subject: `${ctx.agencyName} withdrew their connection request`,
    heading: "Request withdrawn",
    paragraphs: [`Hi ${first(ctx.talentName)},`, "Nothing has changed in your vault."],
    recipientEmail: ctx.talentEmail,
  });
  return sendInvitationEmail(ctx.talentEmail, mail, `link-cancelled-${linkId}`, "link_response");
}

/** E7 + bell to the talent when the agency ends the relationship. */
export async function notifyRelationshipEnded(linkId: string) {
  const ctx = await loadLink(linkId);
  if (!ctx?.link.talent_user_id) return { sent: false };
  const [{ data: years }, { data: readUntil }] = await Promise.all([
    supabaseAdmin.rpc("talent_post_end_access_years"),
    supabaseAdmin.rpc("talent_link_read_until", { _link_id: linkId }),
  ]);
  const until = (readUntil as string | null) ?? ctx.link.ended_at ?? new Date().toISOString();
  await supabaseAdmin.from("talent_notifications").upsert(
    {
      user_id: ctx.link.talent_user_id,
      kind: "relationship_ended",
      dedupe_key: `relationship_ended:${linkId}:${ctx.link.ended_at ?? ""}`,
      title: `Your connection with ${ctx.agencyName} has ended`,
      detail:
        `Items they shared stay viewable, read-only, for ${years} years from the date the connection ended (until ${fmtLongDate(until)}). Anything you added yourself stays yours.`,
      tone: "amber",
      target_type: "agency_link",
      target_id: linkId,
    },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
  if (!ctx.talentEmail) return { sent: false };
  const mail = buildNoticeEmail({
    subject: `Your connection with ${ctx.agencyName} has ended`,
    heading: "What happens to your documents",
    paragraphs: [
      `Hi ${first(ctx.talentName)},`,
      `${ctx.agencyName} has ended the connection. Documents and quotes/invoices they shared with you stay viewable and downloadable, read-only, for ${years} years from the date the connection ended — until ${fmtLongDate(until)}.`,
      "Anything you added yourself stays yours, with no time limit, and you can remove it whenever you like. Your Private Vault is unaffected.",
    ],
    ctaLabel: "View shared items",
    ctaUrl: `${PUBLIC_SITE_URL}/talent/vault`,
    recipientEmail: ctx.talentEmail,
  });
  return sendInvitationEmail(ctx.talentEmail, mail, `relationship-ended-${linkId}`, "relationship_ended");
}
