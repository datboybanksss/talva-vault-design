import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkInviteEmail } from "@/lib/invite-email-check.functions";
import {
  normaliseInviteEmail,
  type InviteEmailConflict,
  type InviteFlow,
} from "@/lib/invite-email-check";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Checks an invitation email against existing accounts and pending
 * invitations. Call `check` when the field is left and before saving; it
 * resolves true when the email is blocked. The server checks again on send.
 */
export function useInviteEmailCheck(flow: InviteFlow, excludeId?: string | null) {
  const fn = useServerFn(checkInviteEmail);
  const [conflict, setConflict] = useState<InviteEmailConflict | null>(null);
  const [checking, setChecking] = useState(false);
  const last = useRef<{ email: string; result: InviteEmailConflict | null } | null>(null);

  const check = useCallback(
    async (raw: string): Promise<boolean> => {
      const email = normaliseInviteEmail(raw);
      if (!EMAIL_RE.test(email)) {
        setConflict(null);
        return false;
      }
      if (last.current?.email === email) {
        setConflict(last.current.result);
        return !!last.current.result;
      }
      setChecking(true);
      try {
        const result = await fn({ data: { flow, email, exclude_id: excludeId || null } });
        last.current = { email, result };
        setConflict(result);
        return !!result;
      } catch {
        // The server repeats the check on save/send, so a failed lookup never blocks here.
        return false;
      } finally {
        setChecking(false);
      }
    },
    [fn, flow, excludeId],
  );

  const clear = useCallback(() => {
    last.current = null;
    setConflict(null);
  }, []);

  return { conflict, checking, check, clear };
}

export function InviteEmailFieldError({
  conflict,
  id,
}: {
  conflict: InviteEmailConflict | null;
  id?: string;
}) {
  if (!conflict) return null;
  return (
    <p className="tvp-field-error" role="alert" id={id}>
      {conflict.message}
      {conflict.link && <a href={conflict.link}>Open invitations</a>}
    </p>
  );
}
