import { databaseError } from "./security-errors";
import {
  decideInviteEmailConflict,
  exactIlike,
  isBlockingInvite,
  sameEmail,
  type InviteEmailConflict,
  type InviteFlow,
} from "@/lib/invite-email-check";

type Args = {
  flow: InviteFlow;
  email: string;
  /** Required for agency flows; pending checks never look outside it. */
  agencyId?: string | null;
  /** The invitation being edited or sent, so it never blocks itself. */
  excludeId?: string | null;
};

/** Looks up account/pending clashes with the service role. Never returns other agencies' data. */
export async function findInviteEmailConflict(args: Args): Promise<InviteEmailConflict | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin;
  const pattern = exactIlike(args.email);
  const now = Date.now();
  type PendingRow = { id: string; email: string | null; status: string; expires_at: string | null };
  const keep = (rows: PendingRow[] | null) =>
    (rows ?? []).filter((r) => r.id !== args.excludeId && isBlockingInvite(r, args.email, now));
  const cols = "id, email, status, expires_at";

  let hasAccount = false;
  if (args.flow !== "agency_talent") {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, email")
      .ilike("email", pattern)
      .limit(5);
    hasAccount = (profs ?? []).some((p: any) => sameEmail(p.email, args.email));
  }

  let pendingLink: string | null | false = false;
  if (args.flow === "agency_staff" || args.flow === "agency_talent") {
    if (!args.agencyId) throw new Error("We couldn't check this email address. Please try again.");
    const table = args.flow === "agency_staff" ? "agency_invitations" : "talent_invitations";
    let q = sb
      .from(table)
      .select(cols)
      .eq("agency_id", args.agencyId)
      .ilike("email", pattern)
      .eq("status", "pending");
    if (args.flow === "agency_staff") q = q.eq("kind", "staff");
    const { data } = await q.limit(20);
    if (keep(data).length) pendingLink = "/agency/invitations";
  } else {
    const [adm, ag, ind, tal] = await Promise.all([
      sb
        .from("admin_invitations")
        .select(cols)
        .ilike("email", pattern)
        .eq("status", "pending")
        .limit(20),
      sb
        .from("agency_invitations")
        .select(`${cols}, kind`)
        .ilike("email", pattern)
        .eq("status", "pending")
        .limit(20),
      sb
        .from("independent_talent_invitations")
        .select(cols)
        .ilike("email", pattern)
        .eq("status", "pending")
        .limit(20),
      sb
        .from("talent_invitations")
        .select(cols)
        .ilike("email", pattern)
        .eq("status", "pending")
        .limit(20),
    ]);
    const a = keep(adm.data)[0];
    const g = keep(ag.data)[0];
    const i = keep(ind.data)[0];
    const t = keep(tal.data)[0];
    if (a) pendingLink = "/admin/administrators";
    else if (i) pendingLink = `/admin/invitations/talent/${i.id}`;
    else if (g && g.kind !== "staff") pendingLink = "/admin/invitations";
    else if (g || t) pendingLink = null; // an agency's own invitation: admins can't resend it from Invitations
  }

  return decideInviteEmailConflict(args.flow, { hasAccount, pendingLink });
}

/** Throws the plain message when the email clashes; call before every insert or send. */
export async function assertInviteEmailFree(args: Args): Promise<void> {
  const conflict = await findInviteEmailConflict(args);
  if (conflict) throw databaseError(conflict);
}
