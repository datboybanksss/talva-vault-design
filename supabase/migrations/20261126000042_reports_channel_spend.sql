-- Monthly acquisition spend by channel for Reports › Business.
-- Rollback: DROP FUNCTION public.reports_set_channel_spend(text,date,bigint); DROP TABLE public.reports_channel_spend;
--   then restore reports_can without the 'manage_spend' branch (see 0026–0038 Reports migrations).
CREATE TABLE IF NOT EXISTS public.reports_channel_spend (
  channel text NOT NULL CHECK (channel ~ '^[a-z_]{1,40}$'),
  month date NOT NULL CHECK (date_trunc('month', month)::date = month),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, month)
);
GRANT SELECT ON public.reports_channel_spend TO authenticated;
GRANT ALL ON public.reports_channel_spend TO service_role;
ALTER TABLE public.reports_channel_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reports spend readable with Reports access" ON public.reports_channel_spend;
CREATE POLICY "Reports spend readable with Reports access" ON public.reports_channel_spend
  FOR SELECT TO authenticated USING (public.reports_can('view_reports'));

CREATE OR REPLACE FUNCTION public.reports_can(_permission text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin') AND public.account_read_allowed(auth.uid()) AND public.mfa_session_ok() AND EXISTS(SELECT 1 FROM public.reports_access a WHERE a.user_id=auth.uid() AND CASE _permission WHEN 'view_reports' THEN true WHEN 'download_raw_data' THEN a.role IN ('owner','operations','analyst') WHEN 'include_email_addresses' THEN a.role='owner' WHEN 'send_messages' THEN a.role IN ('owner','operations') WHEN 'approve_large_sends' THEN a.role IN ('owner','operations') WHEN 'manage_spend' THEN a.role IN ('owner','operations') WHEN 'manage_access' THEN a.role='owner' ELSE false END) $function$;

CREATE OR REPLACE FUNCTION public.reports_set_channel_spend(_channel text, _month date, _amount_cents bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE previous bigint; m date := date_trunc('month', _month)::date;
BEGIN
  IF NOT public.reports_can('manage_spend') THEN
    RAISE EXCEPTION 'REPORT_ACCESS_DENIED: Only a Reports Owner or Operations administrator can record spend.' USING ERRCODE='42501';
  END IF;
  IF _channel IS NULL OR _channel !~ '^[a-z_]{1,40}$' OR _month IS NULL OR (_amount_cents IS NOT NULL AND (_amount_cents < 0 OR _amount_cents > 100000000000)) THEN
    RAISE EXCEPTION 'REPORT_FILTER_INVALID: Choose a channel, a month and a valid amount.';
  END IF;
  SELECT amount_cents INTO previous FROM public.reports_channel_spend WHERE channel=_channel AND month=m;
  IF _amount_cents IS NULL THEN
    DELETE FROM public.reports_channel_spend WHERE channel=_channel AND month=m;
  ELSE
    INSERT INTO public.reports_channel_spend(channel,month,amount_cents,updated_by,updated_at)
    VALUES(_channel,m,_amount_cents,auth.uid(),now())
    ON CONFLICT (channel,month) DO UPDATE SET amount_cents=EXCLUDED.amount_cents, updated_by=EXCLUDED.updated_by, updated_at=now();
  END IF;
  INSERT INTO public.admin_audit_log(actor_id,actor_email,action,target_type,target_id,target_label,detail)
  VALUES(auth.uid(),(SELECT email FROM public.profiles WHERE id=auth.uid()),'set_report_channel_spend','report_spend',_channel||':'||to_char(m,'YYYY-MM'),_channel,
         jsonb_build_object('month',to_char(m,'YYYY-MM'),'previous_cents',previous,'amount_cents',_amount_cents,'currency','ZAR'));
END $function$;
REVOKE ALL ON FUNCTION public.reports_set_channel_spend(text,date,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reports_set_channel_spend(text,date,bigint) TO authenticated;