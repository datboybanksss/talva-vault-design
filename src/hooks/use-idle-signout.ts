import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Ten minutes of no genuine user interaction ends the session. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

/**
 * Signs the user out after IDLE_TIMEOUT_MS without user interaction and sends
 * them to /auth with `next` set to where they were, so signing back in returns
 * them to the same screen. Only real input resets the countdown — background
 * polling, re-renders and network chatter deliberately do not.
 */
export function useIdleSignOut(enabled = true) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.href });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const signOutNow = async () => {
      if (done) return;
      done = true;
      const next = pathRef.current;
      try {
        await supabase.auth.signOut();
      } finally {
        toast.message("Signed out after 10 minutes of inactivity.");
        navigate({ to: "/auth", search: { next } as never, replace: true });
      }
    };

    const reset = () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void signOutNow(), IDLE_TIMEOUT_MS);
    };

    reset();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }
    return () => {
      if (timer) clearTimeout(timer);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
    };
  }, [enabled, navigate]);
}
