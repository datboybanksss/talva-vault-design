import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { SITE_LINK_MISSING_MESSAGE } from "@/lib/brand-email";

/**
 * Used where an invitation email failing should fall back to "copy the link".
 * If the reason is the missing website address, say so plainly instead.
 */
export function siteLinkFallback(error: unknown): { sent: false } {
  if (friendlyError(error) === SITE_LINK_MISSING_MESSAGE) toast.error(SITE_LINK_MISSING_MESSAGE);
  return { sent: false };
}
