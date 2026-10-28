/** Bound regex work to the maximum normal email-address length. */
export function isValidEmail(
  value: string,
  format: "recipient" | "agency" | "administrator" = "recipient",
): boolean {
  const email = value.trim();
  if (email.length > 254) return false;
  switch (format) {
    case "agency":
      return /\S+@\S+\.\S+/.test(email);
    case "administrator":
      return /.+@.+\..+/.test(email);
    default:
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }
}

/** Remove chip separators without repeatedly scanning a long suffix. */
export function stripEmailSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === "," || value[end - 1] === ";")) end--;
  return value.slice(0, end);
}

/** Equivalent to the first non-empty <…> capture, with linear scanning. */
export function emailFromHeader(value: string): string {
  let start = value.indexOf("<");
  while (start !== -1) {
    const end = value.indexOf(">", start + 1);
    if (end === -1) break;
    if (end > start + 1) return value.slice(start + 1, end).trim();
    start = value.indexOf("<", end + 1);
  }
  return value.trim();
}