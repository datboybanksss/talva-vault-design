import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True once a Supabase session exists in the browser. Authenticated server
 * functions require a bearer token, so queries that call them must stay
 * disabled while signed out (e.g. during sign-out, when React Query would
 * otherwise refetch against a cleared session and throw "Unauthorized").
 */
export function useSessionReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return ready;
}
