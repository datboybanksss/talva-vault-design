import { z } from "zod";
import { Constants } from "@/integrations/supabase/types";

/** Stored enum values only; invalid filters use the list's normal friendly validation. */
export const agencyInvitationStatusInput = z.union([
  z.literal("all"),
  z.enum(Constants.public.Enums.invitation_status),
]);