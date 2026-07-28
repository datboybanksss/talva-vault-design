// Server-only reminder engine. Detects documents crossing their reminder /
// expiry threshold and materialises in-app notifications. Email delivery is a
// separate later step (talent_notifications.email_sent_at stays null until the
// sending domain is verified).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Prefs = {
  in_app?: Record<string, boolean>;
  email?: boolean;
};

const DAY = 86400_000;

function fmt(v: string) {
  return new Date(v).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function daysPhrase(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
  if (days < 0) return `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "expires today";
  return `expires in ${days} day${days === 1 ? "" : "s"}`;
}

type Pending = {
  user_id: string;
  kind: string;
  dedupe_key: string;
  title: string;
  detail: string | null;
  tone: string;
  target_type: string;
  target_id: string;
  due_at: string;
};

export async function runTalentReminderScan(opts: { userId?: string } = {}) {
  let profileQ = supabaseAdmin
    .from("talent_profiles")
    .select("id, user_id, expiry_notice_days, notification_prefs")
    .not("user_id", "is", null);
  if (opts.userId) profileQ = profileQ.eq("user_id", opts.userId);
  const { data: profiles, error } = await profileQ;
  if (error) throw new Error(error.message);

  const pending: Pending[] = [];

  for (const p of profiles ?? []) {
    const userId = p.user_id as string;
    const noticeDays = (p.expiry_notice_days as number) ?? 30;
    const prefs = ((p.notification_prefs ?? {}) as Prefs).in_app ?? {};
    const on = (k: string) => prefs[k] !== false;
    const cutoff = new Date(Date.now() + noticeDays * DAY).toISOString();

    // 1. Private Vault documents — explicit reminder_at, or expiry inside the window.
    if (on("doc_expiring")) {
      const { data: docs } = await supabaseAdmin
        .from("talent_private_documents")
        .select("id, name, expires_at, reminder_at")
        .eq("user_id", userId)
        .or(`reminder_at.lte.${new Date().toISOString()},expires_at.lte.${cutoff}`)
        .limit(200);
      for (const d of docs ?? []) {
        const due = (d.expires_at ?? d.reminder_at) as string | null;
        if (!due) continue;
        pending.push({
          user_id: userId,
          kind: "doc_expiring",
          dedupe_key: `doc_expiring:private:${d.id}:${due.slice(0, 10)}`,
          title: `${d.name} ${daysPhrase(due)}`,
          detail: `Private Vault · due ${fmt(due)}`,
          tone: "amber",
          target_type: "private_document",
          target_id: d.id as string,
          due_at: due,
        });
      }
    }

    // 2. Agency Shared Folder documents.
    if (on("doc_expiring")) {
      const { data: link } = await supabaseAdmin
        .from("agency_talent_links")
        .select("id")
        .eq("talent_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (link) {
        const { data: shared } = await supabaseAdmin
          .from("talent_shared_documents")
          .select("id, name, folder, validity_expires_at")
          .eq("talent_link_id", link.id)
          .not("validity_expires_at", "is", null)
          .lte("validity_expires_at", cutoff)
          .limit(200);
        for (const d of shared ?? []) {
          const due = d.validity_expires_at as string;
          pending.push({
            user_id: userId,
            kind: "doc_expiring",
            dedupe_key: `doc_expiring:shared:${d.id}:${due.slice(0, 10)}`,
            title: `${d.name} ${daysPhrase(due)}`,
            detail: `${d.folder} · Agency Shared Folder`,
            tone: "amber",
            target_type: "shared_document",
            target_id: d.id as string,
            due_at: due,
          });
        }
      }
    }

    // 3. Loved One share access approaching expiry.
    if (on("share_expiring")) {
      const { data: shares } = await supabaseAdmin
        .from("loved_one_shares")
        .select("id, loved_one_name, loved_one_email, expires_at")
        .eq("talent_id", p.id)
        .eq("is_active", true)
        .is("revoked_at", null)
        .lte("expires_at", cutoff)
        .limit(100);
      for (const s of shares ?? []) {
        const due = s.expires_at as string;
        pending.push({
          user_id: userId,
          kind: "share_expiring",
          dedupe_key: `share_expiring:${s.id}:${due.slice(0, 10)}`,
          title: `Shared access for ${s.loved_one_name ?? s.loved_one_email} ${daysPhrase(due)}`,
          detail: `Sharing · expires ${fmt(due)}`,
          tone: "purple",
          target_type: "loved_one_share",
          target_id: s.id as string,
          due_at: due,
        });
      }
    }
  }

  if (pending.length === 0) return { scanned: profiles?.length ?? 0, created: 0 };

  // dedupe_key embeds the due date, so a shifted date raises a fresh reminder
  // while an unchanged one stays dismissed.
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("talent_notifications")
    .upsert(pending, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (insErr) throw new Error(insErr.message);

  return { scanned: profiles?.length ?? 0, created: inserted?.length ?? 0 };
}
