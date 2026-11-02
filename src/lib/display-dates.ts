/**
 * Display formats for dates shown to people: "29 Oct 2026" and
 * "15 May 2027, 14:32 SAST". Months are spelled out here (not left to the
 * browser's locale data, which varies between "Sep" and "Sept"), and an
 * unreadable value returns the fallback instead of "Invalid Date".
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SAST_ZONE = "Africa/Johannesburg";

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function sastParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SAST_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: Number(get("day")),
    month: Number(get("month")),
    year: get("year"),
    hour: get("hour").padStart(2, "0"),
    minute: get("minute").padStart(2, "0"),
  };
}

/** "29 Oct 2026" (South African calendar day). */
export function fmtDate(value: string | number | Date | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  const p = sastParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "15 May 2027, 14:32 SAST". */
export function fmtDateTime(
  value: string | number | Date | null | undefined,
  fallback = "—",
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const p = sastParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute} SAST`;
}
