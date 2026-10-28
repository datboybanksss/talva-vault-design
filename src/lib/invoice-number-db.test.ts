import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { databaseError } from "./security-errors";
import { INVOICE_NUMBER_EXISTS_MESSAGE, INVOICE_NUMBER_UNIQUE_INDEX } from "./billing-number";

// Test the installed index on isolated temporary rows, never financial records.
// Copy its actual definition from the database, so a missing/wrong index fails the tests.
function runRule(statement: string) {
  const result = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: `BEGIN;
CREATE TEMP TABLE invoice_number_test (agency_id uuid NOT NULL, number text NOT NULL, kind public.doc_kind NOT NULL);
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_indexdef(indexrelid) INTO definition FROM pg_index
  WHERE indexrelid = 'public.${INVOICE_NUMBER_UNIQUE_INDEX}'::regclass;
  EXECUTE replace(definition, 'ON public.agency_billing_docs', 'ON invoice_number_test');
END $$;
INSERT INTO invoice_number_test VALUES ('11111111-1111-4111-8111-111111111111', 'INV-2026-0042', 'invoice');
${statement}
ROLLBACK;`,
    encoding: "utf8",
    timeout: 15000,
  });
  return result;
}

describe.skipIf(!process.env.PGHOST)("database: invoice-number uniqueness", () => {
  it("rejects a same-agency insert and translates its real unique error", () => {
    const result = runRule(`DO $$ BEGIN
      INSERT INTO invoice_number_test VALUES ('11111111-1111-4111-8111-111111111111', 'INV-2026-0042', 'invoice');
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE '23505:%', SQLERRM;
    END $$;`);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      `23505:duplicate key value violates unique constraint "${INVOICE_NUMBER_UNIQUE_INDEX}"`,
    );
    expect(databaseError({ code: "23505", message: result.stderr }).message).toBe(
      `INVOICE_NUMBER_EXISTS: ${INVOICE_NUMBER_EXISTS_MESSAGE}`,
    );
  });
  it("allows the same number in another agency", () => {
    const result = runRule(
      `INSERT INTO invoice_number_test VALUES ('22222222-2222-4222-8222-222222222222', 'INV-2026-0042', 'invoice'); SELECT count(*) FROM invoice_number_test;`,
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("2");
  });
  it.each(["inv-2026-0042", " INV-2026-0042 ", " inv-2026-0042 "])(
    "rejects variant %s",
    (number) => {
      const result = runRule(
        `INSERT INTO invoice_number_test VALUES ('11111111-1111-4111-8111-111111111111', '${number}', 'invoice');`,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(INVOICE_NUMBER_UNIQUE_INDEX);
    },
  );
  it("leaves duplicate quotes and invoice/quote overlaps unaffected", () => {
    const result = runRule(`INSERT INTO invoice_number_test VALUES
      ('11111111-1111-4111-8111-111111111111', 'INV-2026-0042', 'quote'),
      ('11111111-1111-4111-8111-111111111111', ' inv-2026-0042 ', 'quote'); SELECT count(*) FROM invoice_number_test;`);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("3");
  });
  it("also rejects duplicate number updates", () => {
    const result =
      runRule(`INSERT INTO invoice_number_test VALUES ('11111111-1111-4111-8111-111111111111', 'OTHER', 'invoice');
      UPDATE invoice_number_test SET number = ' inv-2026-0042 ' WHERE number = 'OTHER';`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(INVOICE_NUMBER_UNIQUE_INDEX);
  });
});
