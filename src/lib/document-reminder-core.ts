const DAY = 86_400_000;

/** A due explicit reminder takes precedence; expiry itself still fires when due. */
export function documentReminderDue(expiry: string | null, reminder: string | null, noticeDays: number, now: number) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const lower = start.getTime();
  const expiryMs = expiry ? new Date(expiry).getTime() : NaN;
  const reminderMs = reminder ? new Date(reminder).getTime() : NaN;
  if (expiry && expiryMs < lower) return null;
  if (reminder && reminderMs >= lower && reminderMs <= now) return { date: reminder, kind: "reminder" as const };
  if (expiry && expiryMs >= lower && expiryMs <= now) return { date: expiry, kind: "expiry" as const };
  if (!reminder && expiry && expiryMs >= lower && expiryMs <= now + noticeDays * DAY) return { date: expiry, kind: "expiry" as const };
  return null;
}

export function expiryPhrase(iso: string, now: number) {
  const day = (value: number) => Math.floor(value / DAY);
  const days = day(new Date(iso).getTime()) - day(now);
  if (days < 0) return `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "expires today";
  return `expires in ${days} day${days === 1 ? "" : "s"}`;
}

export function reminderLinkReadable(link: { status: string; ended_at: string | null }, until: string | null, now: number) {
  return ["active", "read_only", "needs_review"].includes(link.status) && !link.ended_at && (!until || new Date(until).getTime() > now);
}
