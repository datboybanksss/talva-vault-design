-- Completed account sign-ins and distinct trusted-contact code visits.
-- Additive, idempotent; retain every historical audit row and all existing MFA rules.
ALTER TABLE public.talent_audit_log ADD COLUMN IF NOT EXISTS sign_in_session_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS talent_login_session_unique ON public.talent_audit_log(actor_id, sign_in_session_id) WHERE action='login' AND sign_in_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS talent_audit_action_created_idx ON public.talent_audit_log(action, created_at);
-- Existing actor/time indexes are reused, not duplicated or removed.
CREATE INDEX IF NOT EXISTS contact_access_event_created_idx ON public.loved_one_share_access_events(event, created_at);

-- The deployment timestamp is stamped once in a function, queried by reports (no invented history).
DO $migration$ BEGIN
  IF to_regprocedure('public.sign_in_capture_started_at()') IS NULL THEN
    EXECUTE format('CREATE FUNCTION public.sign_in_capture_started_at() RETURNS timestamptz LANGUAGE sql STABLE SET search_path=pg_catalog AS %L', 'SELECT ' || quote_literal(clock_timestamp()) || '::timestamptz');
  END IF;
END $migration$;
REVOKE ALL ON FUNCTION public.sign_in_capture_started_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_in_capture_started_at() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_completed_sign_in() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_user NOT IN ('service_role', pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.talent_audit_log'::regclass))) THEN
    IF (TG_OP <> 'DELETE' AND (NEW.action='login' OR NEW.sign_in_session_id IS NOT NULL))
       OR (TG_OP <> 'INSERT' AND (OLD.action='login' OR OLD.sign_in_session_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'SIGN_IN_WRITE_REFUSED: Sign-ins are recorded automatically.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_completed_sign_in ON public.talent_audit_log;
CREATE TRIGGER protect_completed_sign_in BEFORE INSERT OR UPDATE OR DELETE ON public.talent_audit_log FOR EACH ROW EXECUTE FUNCTION public.protect_completed_sign_in();
REVOKE ALL ON FUNCTION public.protect_completed_sign_in() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_completed_sign_in(_ip text DEFAULT NULL, _user_agent text DEFAULT NULL, _device text DEFAULT NULL, _new_device boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid := auth.uid(); sid uuid; raw_sid text := auth.jwt()->>'session_id';
BEGIN
  IF u IS NULL OR NOT public.account_read_allowed(u) THEN RAISE EXCEPTION 'SIGN_IN_REQUIRED: Please sign in again.' USING ERRCODE='42501'; END IF;
  IF NOT public.mfa_session_ok() THEN RAISE EXCEPTION 'MFA_REQUIRED: Please enter your sign-in code.' USING ERRCODE='42501'; END IF;
  IF raw_sid IS NULL OR raw_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'SIGN_IN_REQUIRED: Please sign in again.' USING ERRCODE='42501';
  END IF;
  sid := raw_sid::uuid;
  INSERT INTO public.talent_audit_log(actor_id,actor_email,action,target_type,target_id,target_label,detail,ip_address,user_agent,sign_in_session_id)
  VALUES(u,auth.jwt()->>'email','login','account',u,'Signed in',jsonb_build_object('device',left(_device,120),'new_device',_new_device),left(_ip,100),left(_user_agent,1000),sid)
  ON CONFLICT (actor_id,sign_in_session_id) WHERE action='login' AND sign_in_session_id IS NOT NULL DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.record_completed_sign_in(text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_completed_sign_in(text,text,text,boolean) TO authenticated;

-- Internal aggregate: one row/person, scoped before contact-email deduplication.
CREATE OR REPLACE FUNCTION public.admin_sign_in_people(_from date, _to date, _accounts text DEFAULT 'real', _as_of timestamptz DEFAULT now())
RETURNS TABLE(person_id text, name text, account_type text, agency_ids uuid[], agency_names text[], onboarded_at timestamptz, sign_ins bigint, active_days bigint, average_per_week numeric, first_sign_in timestamptz, last_sign_in timestamptz, days_since_last integer, dormant boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE start_at timestamptz := _from::timestamp AT TIME ZONE 'Africa/Johannesburg';
  end_at timestamptz := LEAST((_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg', _as_of, now());
  cutoff_day date := LEAST(_to, (LEAST(_as_of,now()) AT TIME ZONE 'Africa/Johannesburg')::date);
  selected_days integer := _to - _from + 1;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR NOT public.account_read_allowed(auth.uid()) THEN RAISE EXCEPTION 'REPORTS_ADMIN_ONLY: These reports are available to administrators only.' USING ERRCODE='42501'; END IF;
  IF NOT public.mfa_session_ok() THEN RAISE EXCEPTION 'MFA_REQUIRED: Please enter your sign-in code.' USING ERRCODE='42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from>_to OR _as_of IS NULL OR _accounts NOT IN ('real','test','all') THEN RAISE EXCEPTION 'REPORT_RANGE_INVALID: Please choose a valid reporting period.'; END IF;
  RETURN QUERY
  WITH admin_ids AS (SELECT user_id FROM public.user_roles WHERE role='admin'),
  staff_members AS (
    SELECT m.user_id, m.agency_id, a.name AS agency_name, a.is_test,
      COALESCE((SELECT min(i.accepted_at) FROM public.agency_invitations i WHERE i.agency_id=m.agency_id AND lower(btrim(i.email))=lower(btrim(p.email)) AND i.accepted_at IS NOT NULL), p.terms_accepted_at) AS completed_at,
      COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Name not recorded') AS person_name
    FROM public.agency_members m JOIN public.agencies a ON a.id=m.agency_id JOIN public.profiles p ON p.id=m.user_id
    WHERE NOT EXISTS(SELECT 1 FROM admin_ids x WHERE x.user_id=m.user_id)
      AND NOT EXISTS(SELECT 1 FROM public.talent_profiles d WHERE d.user_id=m.user_id AND d.deleted_at IS NOT NULL)
      AND m.created_at < end_at
  ),
  staff AS (
    SELECT m.user_id::text AS pid, min(m.person_name) AS nm, 'agency_staff'::text AS typ,
      array_agg(DISTINCT m.agency_id) AS aids, array_agg(DISTINCT m.agency_name ORDER BY m.agency_name) AS anames, min(m.completed_at) AS completed
    FROM staff_members m WHERE m.completed_at < end_at AND (_accounts='all' OR m.is_test=(_accounts='test')) GROUP BY m.user_id
  ),
  talent AS (
    SELECT t.user_id::text AS pid, COALESCE(NULLIF(btrim(t.full_name),''),'Name not recorded') AS nm, 'talent'::text AS typ,
      COALESCE(links.aids,ARRAY[]::uuid[]) AS aids, COALESCE(links.anames,ARRAY[]::text[]) AS anames, t.activation_completed_at AS completed
    FROM public.talent_profiles t JOIN public.profiles p ON p.id=t.user_id
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT a.id) AS aids, array_agg(DISTINCT a.name ORDER BY a.name) AS anames
      FROM public.agency_talent_links l JOIN public.agencies a ON a.id=l.agency_id
      WHERE l.talent_user_id=t.user_id AND l.status='active' AND l.ended_at IS NULL AND l.created_at < end_at
    ) links ON true
    WHERE t.deleted_at IS NULL AND t.activation_completed_at < end_at AND (_accounts='all' OR t.is_test=(_accounts='test'))
      AND NOT EXISTS(SELECT 1 FROM admin_ids x WHERE x.user_id=t.user_id)
      AND NOT EXISTS(SELECT 1 FROM public.agency_members m WHERE m.user_id=t.user_id)
  ),
  scoped_shares AS (
    SELECT s.id,lower(btrim(s.loved_one_email)) AS recipient,COALESCE(NULLIF(btrim(s.loved_one_name),''),'Name not recorded') AS nm,s.created_at
    FROM public.loved_one_shares s JOIN public.talent_profiles t ON t.id=s.talent_id
    WHERE s.access_code_hash IS NOT NULL AND btrim(s.loved_one_email)<>'' AND s.created_at < end_at
      AND t.deleted_at IS NULL AND (_accounts='all' OR t.is_test=(_accounts='test'))
  ),
  contacts AS (
    SELECT 'recipient:'||md5(s.recipient) AS pid,min(s.nm) AS nm,'trusted_contact'::text AS typ, ARRAY[]::uuid[] AS aids,ARRAY[]::text[] AS anames,min(s.created_at) AS completed
    FROM scoped_shares s GROUP BY s.recipient
  ),
  roster AS (SELECT * FROM staff UNION ALL SELECT * FROM talent UNION ALL SELECT * FROM contacts),
  events AS (
    SELECT e.actor_id::text AS pid,e.created_at AS occurred_at FROM public.talent_audit_log e WHERE e.action='login' AND e.created_at < end_at
    UNION ALL
    SELECT 'recipient:'||md5(s.recipient),e.created_at FROM public.loved_one_share_access_events e JOIN scoped_shares s ON s.id=e.share_id
    WHERE e.event='successful_code' AND e.created_at < end_at
  ),
  aggregated AS (
    SELECT r.pid,r.nm,r.typ,r.aids,r.anames,r.completed,
      count(e.occurred_at) FILTER(WHERE e.occurred_at>=start_at) AS n,
      count(DISTINCT (e.occurred_at AT TIME ZONE 'Africa/Johannesburg')::date) FILTER(WHERE e.occurred_at>=start_at) AS days,
      min(e.occurred_at) AS first_at,max(e.occurred_at) AS last_at
    FROM roster r LEFT JOIN events e ON e.pid=r.pid GROUP BY r.pid,r.nm,r.typ,r.aids,r.anames,r.completed
  )
  SELECT a.pid,a.nm,a.typ,a.aids,a.anames,a.completed,a.n,a.days,round(a.n*7.0/selected_days,2),a.first_at,a.last_at,
    CASE WHEN a.last_at IS NULL THEN NULL ELSE cutoff_day-(a.last_at AT TIME ZONE 'Africa/Johannesburg')::date END,
    cutoff_day-(COALESCE(a.last_at,a.completed) AT TIME ZONE 'Africa/Johannesburg')::date>=30
  FROM aggregated a;
END $$;
REVOKE ALL ON FUNCTION public.admin_sign_in_people(date,date,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sign_in_people(date,date,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sign_in_summary(_from date, _to date, _accounts text DEFAULT 'real', _as_of timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; prior_to date:=_from-1; prior_from date:=_from-(_to-_from+1);
BEGIN
  -- Calling the people function enforces Admin, account and MFA checks on every path.
  WITH people AS (
    SELECT 'current'::text AS period,p.* FROM public.admin_sign_in_people(_from,_to,_accounts,_as_of) p
    UNION ALL SELECT 'prior',p.* FROM public.admin_sign_in_people(prior_from,prior_to,_accounts,_as_of) p
  ), types AS (SELECT unnest(ARRAY['agency_staff','talent','trusted_contact']) AS typ), periods AS (SELECT unnest(ARRAY['current','prior']) AS period),
  stats AS (
    SELECT t.typ,pr.period,count(p.person_id) AS total,count(p.person_id) FILTER(WHERE p.sign_ins>0) AS active,
      count(p.person_id) FILTER(WHERE p.active_days>=2) AS returning,COALESCE(sum(p.sign_ins),0) AS sign_ins,
      COALESCE(round(sum(p.active_days)::numeric/NULLIF(count(p.person_id) FILTER(WHERE p.sign_ins>0),0),2),0) AS average_days,
      count(p.person_id) FILTER(WHERE p.dormant) AS dormant
    FROM types t CROSS JOIN periods pr LEFT JOIN people p ON p.account_type=t.typ AND p.period=pr.period GROUP BY t.typ,pr.period
  )
  SELECT jsonb_build_object('groups',(SELECT jsonb_agg(jsonb_build_object('type',t.typ,
    'current',(SELECT to_jsonb(s)-'typ'-'period' FROM stats s WHERE s.typ=t.typ AND s.period='current'),
    'prior',(SELECT to_jsonb(s)-'typ'-'period' FROM stats s WHERE s.typ=t.typ AND s.period='prior'),
    'tracking_since',CASE WHEN t.typ='trusted_contact' THEN (SELECT min(e.created_at) FROM public.loved_one_share_access_events e JOIN public.loved_one_shares sh ON sh.id=e.share_id JOIN public.talent_profiles tp ON tp.id=sh.talent_id WHERE e.event='successful_code' AND tp.deleted_at IS NULL AND (_accounts='all' OR tp.is_test=(_accounts='test')))
      ELSE (SELECT min(a.created_at) FROM public.talent_audit_log a JOIN people p ON p.period='current' AND p.person_id=a.actor_id::text AND p.account_type=t.typ WHERE a.action='login') END
    ) ORDER BY t.typ) FROM types t),
    'unconfirmed_talent',(SELECT count(*) FROM public.talent_profiles t WHERE t.deleted_at IS NULL AND t.activation_completed_at IS NULL AND t.created_at<=LEAST(_as_of,(_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg') AND (_accounts='all' OR t.is_test=(_accounts='test'))),
    'unresolved_logins',(SELECT count(*) FROM public.talent_audit_log a WHERE a.action='login' AND a.created_at>=_from::timestamp AT TIME ZONE 'Africa/Johannesburg' AND a.created_at<LEAST(_as_of,(_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg') AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a.actor_id)),
    'capture_started_at',public.sign_in_capture_started_at(),
    'as_of',LEAST(_as_of,now()),'prior',jsonb_build_object('from',prior_from,'to',prior_to)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_sign_in_summary(date,date,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sign_in_summary(date,date,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sign_in_page(_from date,_to date,_accounts text DEFAULT 'real',_type text DEFAULT 'all',_population text DEFAULT 'all',_agency uuid DEFAULT NULL,_sort text DEFAULT 'sign_ins',_direction text DEFAULT 'desc',_limit integer DEFAULT 25,_offset integer DEFAULT 0,_as_of timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
  IF _type NOT IN ('all','agency_staff','talent','trusted_contact') OR _population NOT IN ('all','active','returning','dormant') OR _sort NOT IN ('name','account_type','agency','sign_ins','active_days','average_per_week','first_sign_in','last_sign_in','days_since_last') OR _direction NOT IN ('asc','desc') OR _limit NOT BETWEEN 1 AND 200 OR _offset<0 THEN RAISE EXCEPTION 'REPORT_FILTER_INVALID: Please choose valid report filters.'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT * FROM public.admin_sign_in_people(_from,_to,_accounts,_as_of) p
    WHERE (_type='all' OR p.account_type=_type) AND (_agency IS NULL OR _agency=ANY(p.agency_ids))
      AND (_population='all' OR (_population='active' AND p.sign_ins>0) OR (_population='returning' AND p.active_days>=2) OR (_population='dormant' AND p.dormant))
  ), paged AS (
    SELECT * FROM filtered p ORDER BY
      CASE WHEN _direction='asc' THEN CASE _sort WHEN 'name' THEN lower(p.name) WHEN 'account_type' THEN p.account_type WHEN 'agency' THEN array_to_string(p.agency_names,', ') END END ASC NULLS LAST,
      CASE WHEN _direction='desc' THEN CASE _sort WHEN 'name' THEN lower(p.name) WHEN 'account_type' THEN p.account_type WHEN 'agency' THEN array_to_string(p.agency_names,', ') END END DESC NULLS LAST,
      CASE WHEN _direction='asc' THEN CASE _sort WHEN 'sign_ins' THEN p.sign_ins WHEN 'active_days' THEN p.active_days WHEN 'average_per_week' THEN p.average_per_week WHEN 'days_since_last' THEN p.days_since_last END END ASC NULLS LAST,
      CASE WHEN _direction='desc' THEN CASE _sort WHEN 'sign_ins' THEN p.sign_ins WHEN 'active_days' THEN p.active_days WHEN 'average_per_week' THEN p.average_per_week WHEN 'days_since_last' THEN p.days_since_last END END DESC NULLS LAST,
      CASE WHEN _direction='asc' THEN CASE _sort WHEN 'first_sign_in' THEN p.first_sign_in WHEN 'last_sign_in' THEN p.last_sign_in END END ASC NULLS LAST,
      CASE WHEN _direction='desc' THEN CASE _sort WHEN 'first_sign_in' THEN p.first_sign_in WHEN 'last_sign_in' THEN p.last_sign_in END END DESC NULLS LAST,
      p.person_id ASC LIMIT _limit OFFSET _offset
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM paged p),'[]'::jsonb),'as_of',LEAST(_as_of,now()),
    'agencies',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.name,a.id) FROM public.agencies a WHERE EXISTS(SELECT 1 FROM public.admin_sign_in_people(_from,_to,_accounts,_as_of) p WHERE a.id=ANY(p.agency_ids))),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz) TO authenticated;

-- Rollback (manual additive rollback migration; never erase history or reset MFA):
-- DROP FUNCTION IF EXISTS public.admin_sign_in_page(date,date,text,text,text,uuid,text,text,integer,integer,timestamptz);
-- DROP FUNCTION IF EXISTS public.admin_sign_in_summary(date,date,text,timestamptz);
-- DROP FUNCTION IF EXISTS public.admin_sign_in_people(date,date,text,timestamptz);
-- Revert recording/export/UI edits together before removing recorder guards.
-- DROP FUNCTION IF EXISTS public.record_completed_sign_in(text,text,text,boolean);
-- DROP TRIGGER IF EXISTS protect_completed_sign_in ON public.talent_audit_log;
-- DROP FUNCTION IF EXISTS public.protect_completed_sign_in();
-- DROP INDEX IF EXISTS public.talent_login_session_unique;
-- DROP INDEX IF EXISTS public.talent_audit_action_created_idx;
-- DROP INDEX IF EXISTS public.contact_access_event_created_idx;
-- Keep sign_in_session_id and capture timestamp function as inert metadata; keep all login/successful_code rows.