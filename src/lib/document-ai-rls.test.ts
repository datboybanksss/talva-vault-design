import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Real PostgreSQL RLS check; fixture rows and lifecycle changes always roll back. */
describe.skipIf(!process.env.SUPABASE_DB_URL)("analysis read policy matches document access", () => {
  it("tracks document readers for every account, suspension windows and post-end windows", () => {
    const sql = `
BEGIN;
CREATE TEMP TABLE audit_fixture AS
 SELECT l.id link_id, l.agency_id FROM public.agency_talent_links l
 WHERE l.talent_user_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.talent_shared_documents d WHERE d.talent_link_id=l.id)
 LIMIT 1;
INSERT INTO public.document_ai_analyses(scope,document_id,requested_by,agency_id)
 SELECT 'agency',d.id,coalesce(d.uploaded_by,l.talent_user_id),d.agency_id
 FROM public.talent_shared_documents d JOIN public.agency_talent_links l ON l.id=d.talent_link_id
 WHERE l.talent_user_id IS NOT NULL ON CONFLICT(scope,document_id) DO NOTHING;
INSERT INTO public.document_ai_analyses(scope,document_id,requested_by)
 SELECT 'talent',id,user_id FROM public.talent_private_documents
 ON CONFLICT(scope,document_id) DO NOTHING;
CREATE TEMP TABLE audit_users AS SELECT distinct user_id FROM public.user_roles;
GRANT SELECT ON audit_users TO authenticated;
CREATE FUNCTION pg_temp.verify_analysis_readers() RETURNS void LANGUAGE plpgsql AS $$
DECLARE u uuid; mismatch integer;
BEGIN
 FOR u IN SELECT user_id FROM audit_users LOOP
   PERFORM set_config('request.jwt.claim.sub',u::text,true);
   SELECT count(*) INTO mismatch FROM (
     (SELECT 'agency' scope,id FROM public.talent_shared_documents
      UNION ALL SELECT 'talent',id FROM public.talent_private_documents)
     EXCEPT
     (SELECT scope,document_id FROM public.document_ai_analyses)
   ) t;
   -- Only documents for which an analysis fixture exists are compared.
   IF EXISTS (
     SELECT 1 FROM public.document_ai_analyses a
     WHERE (scope='agency' AND NOT EXISTS(SELECT 1 FROM public.talent_shared_documents d WHERE d.id=a.document_id))
        OR (scope='talent' AND NOT EXISTS(SELECT 1 FROM public.talent_private_documents d WHERE d.id=a.document_id))
   ) THEN RAISE EXCEPTION 'Analysis exposed without document access'; END IF;
   IF mismatch <> 0 THEN RAISE EXCEPTION 'A readable document analysis was hidden'; END IF;
 END LOOP;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.verify_analysis_readers();
RESET ROLE;
UPDATE public.agencies SET status='suspended',suspended_at=now()-interval '1 year' WHERE id IN(SELECT agency_id FROM audit_fixture);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verify_analysis_readers();
RESET ROLE;
UPDATE public.agencies SET suspended_at=now()-interval '11 years' WHERE id IN(SELECT agency_id FROM audit_fixture);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verify_analysis_readers();
RESET ROLE;
UPDATE public.agencies SET status='accepted',suspended_at=NULL WHERE id IN(SELECT agency_id FROM audit_fixture);
UPDATE public.agency_talent_links SET status='ended',ended_at=now()-interval '9 years' WHERE id IN(SELECT link_id FROM audit_fixture);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verify_analysis_readers();
RESET ROLE;
UPDATE public.agency_talent_links SET ended_at=now()-interval '11 years' WHERE id IN(SELECT link_id FROM audit_fixture);
SET LOCAL ROLE authenticated;
SELECT pg_temp.verify_analysis_readers();
RESET ROLE;
ROLLBACK;
`;
    const result = execFileSync("psql", [process.env.SUPABASE_DB_URL ?? "", "-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result).toContain("ROLLBACK");
  });
});
