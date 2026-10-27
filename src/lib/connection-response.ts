import type { Tables } from "@/integrations/supabase/types";

type Response = Pick<Tables<"agency_talent_links">, "id" | "display_name" | "status" | "declined_at">;

export function connectionResponseReminder(r: Response) {
  const declined = !!r.declined_at;
  const accepted = !declined && r.status !== "revoked" && r.status !== "expired";
  return {
    id: `link_response:${r.id}`,
    key: `link_response:${r.id}`,
    snapshot: 1,
    tone: accepted ? "green" as const : "amber" as const,
    title: accepted ? `${r.display_name} accepted your connection request` : declined ? `${r.display_name} declined your connection request` : `Your connection request to ${r.display_name} expired`,
    detail: accepted ? "Their shared folders are ready in your roster." : declined ? "No access has been granted. You can send a new request after 30 days." : "No access has been granted. You can send a new request.",
    to: "/agency/talent",
  };
}

export function reminderVisible(key: string | undefined, snapshot: number | undefined, dismissed: Map<string, number | null>) {
  const previous = key === undefined ? undefined : dismissed.get(key);
  return previous === undefined || previous === null || previous < (snapshot ?? NaN);
}