import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findClientDuplicates, formatClientAddress } from "./client-duplicates";

const rows = [
  { id: "1", name: "Brightline Media", emails: ["Accounts@Brightline.co.za"], vat_number: "4123 456 789" },
  { id: "2", name: "Kalahari Retail", emails: [], vat_number: null, archived_at: "2026-01-01" },
];

describe("client book duplicate warning", () => {
  it("matches the same name, ignoring case and surrounding spaces", () => {
    expect(findClientDuplicates({ name: "  brightline media " }, rows).name?.id).toBe("1");
  });
  it("matches any shared email address", () => {
    expect(findClientDuplicates({ emails: ["accounts@brightline.co.za"] }, rows).email?.id).toBe("1");
  });
  it("matches VAT numbers with spaces removed", () => {
    expect(findClientDuplicates({ vat_number: "4123456789" }, rows).vat_number?.id).toBe("1");
  });
  it("still warns about archived clients", () => {
    expect(findClientDuplicates({ name: "Kalahari Retail" }, rows).name?.id).toBe("2");
  });
  it("never flags the client being edited", () => {
    expect(findClientDuplicates({ id: "1", name: "Brightline Media" }, rows).name).toBeNull();
  });
  it("only compares against the rows it is given (one agency's clients)", () => {
    expect(findClientDuplicates({ name: "Brightline Media" }, []).name).toBeNull();
  });
});

describe("billing address on documents", () => {
  it("joins the filled parts in South African order", () => {
    expect(
      formatClientAddress({ address: "1 Long St", city: "Cape Town", postal_code: "8001", country: "South Africa" }),
    ).toBe("1 Long St, Cape Town, 8001, South Africa");
  });
});

/**
 * Live database rules, inside one block that always raises at the end so every
 * change is rolled back. Needs RLS_TEST_DB_URL (privileged connection).
 */
const LIVE_SQL = `DO $$
DECLARE
  a uuid; b uuid; m uuid; cb uuid; carch uuid; c uuid; d uuid; d2 uuid;
  seen_other int; archived_blocked boolean := false; required_blocked boolean := false;
  draft_name text; sent_name text; snap_name text; addr text; addr_after text;
BEGIN
  SELECT mm.agency_id, mm.user_id INTO a, m FROM public.agency_members mm
   WHERE NOT public.has_role(mm.user_id, 'admin') ORDER BY mm.created_at LIMIT 1;
  SELECT id INTO b FROM public.agencies WHERE id <> a ORDER BY created_at LIMIT 1;

  INSERT INTO public.agency_clients(agency_id, name, emails) VALUES (b, 'ZZ Other agency client', '{x@other.test}') RETURNING id INTO cb;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen_other FROM public.agency_clients WHERE id = cb;
  RESET ROLE;

  INSERT INTO public.agency_clients(agency_id, name, emails, archived_at) VALUES (a, 'ZZ Archived', '{a@x.test}', now()) RETURNING id INTO carch;
  BEGIN
    INSERT INTO public.agency_billing_docs(agency_id, kind, number, client_id, issued_at, currency, total_cents, status)
    VALUES (a, 'invoice', 'ZZ-T1', carch, current_date, 'ZAR', 100, 'draft');
  EXCEPTION WHEN others THEN archived_blocked := true; END;

  INSERT INTO public.agency_billing_docs(agency_id, kind, number, issued_at, currency, total_cents, status)
  VALUES (a, 'invoice', 'ZZ-T2', current_date, 'ZAR', 100, 'draft') RETURNING id INTO d2;
  BEGIN
    UPDATE public.agency_billing_docs SET status = 'sent' WHERE id = d2;
  EXCEPTION WHEN others THEN required_blocked := true; END;

  INSERT INTO public.agency_clients(agency_id, name, emails, address, city, postal_code)
  VALUES (a, 'ZZ Snapshot Ltd', '{s@x.test}', '1 Long St', 'Cape Town', '8001') RETURNING id INTO c;
  INSERT INTO public.agency_billing_docs(agency_id, kind, number, client_id, issued_at, currency, total_cents, status)
  VALUES (a, 'invoice', 'ZZ-T3', c, current_date, 'ZAR', 100, 'draft') RETURNING id INTO d;
  UPDATE public.agency_clients SET name = 'ZZ Snapshot Renamed' WHERE id = c;
  SELECT client_name INTO draft_name FROM public.agency_billing_docs WHERE id = d;
  UPDATE public.agency_billing_docs SET status = 'sent' WHERE id = d;
  SELECT recipient_address INTO addr FROM public.agency_billing_docs WHERE id = d;
  UPDATE public.agency_clients SET name = 'ZZ After Issue', address = '9 New Rd' WHERE id = c;
  UPDATE public.agency_billing_docs SET recipient_address = 'tampered' WHERE id = d;
  SELECT client_name, client_snapshot->>'name', recipient_address INTO sent_name, snap_name, addr_after
    FROM public.agency_billing_docs WHERE id = d;

  RAISE EXCEPTION 'RESULT %', json_build_object(
    'other_agency_rows_visible', seen_other, 'archived_blocked', archived_blocked,
    'send_without_client_blocked', required_blocked, 'draft_followed_edit', draft_name,
    'issued_name', sent_name, 'snapshot_name', snap_name, 'address_at_issue', addr,
    'address_after_edit', addr_after);
END $$;
`;

describe.skipIf(!process.env.RLS_TEST_DB_URL)("live: client book rules in the database", () => {
  const out = () => {
    const r = spawnSync("psql", [process.env.RLS_TEST_DB_URL ?? "", "-At", "-q"], {
      input: LIVE_SQL,
      encoding: "utf8",
    });
    const m = /RESULT (\{.*\})/.exec(r.stderr ?? "");
    if (!m) throw new Error(r.stderr || "no result");
    return JSON.parse(m[1]);
  };
  it("isolates agencies, blocks archived clients, requires a client to send and freezes issued details", () => {
    const r = out();
    expect(r.other_agency_rows_visible).toBe(0);
    expect(r.archived_blocked).toBe(true);
    expect(r.send_without_client_blocked).toBe(true);
    expect(r.draft_followed_edit).toBe("ZZ Snapshot Renamed");
    expect(r.issued_name).toBe("ZZ Snapshot Renamed");
    expect(r.snapshot_name).toBe("ZZ Snapshot Renamed");
    expect(r.address_after_edit).toBe(r.address_at_issue);
  });
});
