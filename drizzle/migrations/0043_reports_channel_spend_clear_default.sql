-- Lets a caller clear a spend entry by leaving the amount out. Same checks, audit and grants as 0042.
-- Rollback: recreate the function from 0042_reports_channel_spend.sql (amount without a default).
CREATE OR REPLACE FUNCTION public.reports_set_channel_spend(_channel text, _month date, _amount_cents bigint DEFAULT NULL)
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