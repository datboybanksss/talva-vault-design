ALTER TABLE public.agency_audit_log
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS agency_audit_log_agency_created_idx
  ON public.agency_audit_log (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agency_audit_log_action_idx
  ON public.agency_audit_log (agency_id, action);