import type { Tables } from "@/integrations/supabase/types";

type ProfileName = Pick<Tables<"profiles">, "display_name" | "first_name" | "last_name" | "email">;

export function profileName(profile: ProfileName | null | undefined): string | null {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    null
  );
}
