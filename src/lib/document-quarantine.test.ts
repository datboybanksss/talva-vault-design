import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  QUARANTINE_LABEL,
  QUARANTINE_MESSAGES,
  assertNotQuarantined,
  listableDocument,
  quarantineFromError,
  quarantineReason,
  reasonForRejection,
} from "./document-quarantine";
import { friendlyError } from "./friendly-error";
import { statusLabel } from "./status-labels";

describe("security-blocked documents", () => {
  it("are listed with the 'Blocked for security' status", () => {
    const row = { validated_at: null, quarantine_reason: "blocked_type" };
    expect(listableDocument(row)).toBe(true);
    expect(quarantineReason(row)).toBe("blocked_type");
    expect(statusLabel("document", "blocked_security")).toBe(QUARANTINE_LABEL);
    expect(QUARANTINE_LABEL).toBe("Blocked for security");
  });

  it("an upload still being checked is neither listed nor shown as blocked", () => {
    const inProgress = { validated_at: null, quarantine_reason: null };
    expect(quarantineReason(inProgress)).toBeNull();
    expect(listableDocument(inProgress)).toBe(false);
  });

  it("a validated file is never blocked", () => {
    expect(
      quarantineReason({ validated_at: "2026-10-25T00:00:00Z", quarantine_reason: "blocked_type" }),
    ).toBeNull();
  });

  it("refuses with a stable code and the exact message for each reason", () => {
    expect(() =>
      assertNotQuarantined({ validated_at: null, quarantine_reason: "blocked_type" }),
    ).toThrow(/^DOCUMENT_BLOCKED_TYPE: /);
    expect(() =>
      assertNotQuarantined({ validated_at: null, quarantine_reason: "failed_check" }),
    ).toThrow(/^DOCUMENT_FAILED_CHECK: /);
    for (const reason of ["blocked_type", "failed_check"] as const) {
      try {
        assertNotQuarantined({ validated_at: null, quarantine_reason: reason });
      } catch (e) {
        expect(friendlyError(e)).toBe(QUARANTINE_MESSAGES[reason]);
        expect(quarantineFromError(e)).toBe(reason);
      }
    }
    expect(QUARANTINE_MESSAGES.blocked_type).toBe(
      "This file can't be opened for security reasons. Its file type can contain code, so we don't allow it. Please upload it again as a PDF or image.",
    );
    expect(QUARANTINE_MESSAGES.failed_check).toBe(
      "This file can't be opened because it didn't pass our security check. It may be damaged or not match its file type. Please upload it again.",
    );
  });

  it("maps checker rejections to the right reason", () => {
    expect(reasonForRejection("UPLOAD_TYPE_NOT_ALLOWED")).toBe("blocked_type");
    expect(reasonForRejection("UPLOAD_MISSING")).toBe("failed_check");
    expect(reasonForRejection("UPLOAD_TYPE_MISMATCH")).toBe("failed_check");
  });

  it("every route that hands out a file checks for quarantine first", () => {
    const checks: Array<[string, RegExp]> = [
      ["src/lib/agency.functions.ts", /assertNotQuarantined\(row\)/],
      ["src/lib/agency.functions.ts", /assertNotQuarantined\(v\)/],
      ["src/lib/talent.functions.ts", /assertNotQuarantined\(doc\)/],
      [
        "src/lib/talent-vault.functions.ts",
        /assertNotQuarantined\(doc\);\n\s+if \(!documentIsValidated\(doc\)\) throw new Error\("This file is still/,
      ],
      [
        "src/lib/talent-vault.functions.ts",
        /assertNotQuarantined\(doc\);\n\s+if \(!documentIsValidated\(doc\)\) throw new Error\("This file must finish/,
      ],
      ["src/lib/independent-talent.functions.ts", /assertNotQuarantined\(doc\)/],
      ["src/routes/api/public/loved-one-file.ts", /QUARANTINE_CODES\[blocked\]/],
    ];
    for (const [file, re] of checks) expect(readFileSync(file, "utf8")).toMatch(re);
  });
});

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

describe("hosted quarantine records", () => {
  it.skipIf(!url || !service)("the seven documents carry the checker's reason", async () => {
    const h = { apikey: service!, Authorization: `Bearer ${service}` };
    const get = (t: string, ids: string[]) =>
      fetch(
        `${url}/rest/v1/${t}?select=id,validated_at,quarantine_reason&id=in.(${ids.join(",")})`,
        { headers: h },
      ).then((r) => r.json());
    const tsd = await get("talent_shared_documents", [
      "2dcb50dd-9c3f-45d4-be91-dfbcff7f6891",
      "6366d59b-4dbb-4dda-843d-08465089115a",
      "23d84a5e-b96a-49cc-9dbb-7ac82a564119",
    ]);
    const byId = Object.fromEntries(tsd.map((r: any) => [r.id, r.quarantine_reason]));
    expect(byId["2dcb50dd-9c3f-45d4-be91-dfbcff7f6891"]).toBe("failed_check");
    expect(byId["6366d59b-4dbb-4dda-843d-08465089115a"]).toBe("failed_check");
    expect(byId["23d84a5e-b96a-49cc-9dbb-7ac82a564119"]).toBe("blocked_type");
    const acd = await get("agency_compliance_documents", [
      "28b2fa09-b80f-42ae-ab39-9275c1643b40",
      "ad230793-3eaf-412a-9737-9237d68d8c0d",
      "1250c0fe-7bc1-46ce-81ee-ff0da487280f",
    ]);
    expect(acd.map((r: any) => r.quarantine_reason)).toEqual([
      "blocked_type",
      "blocked_type",
      "blocked_type",
    ]);
    const v = await get("talent_shared_document_versions", [
      "750c9c1c-af02-4b19-97b6-840dbaaad40b",
    ]);
    expect(v[0].quarantine_reason).toBe("blocked_type");
    for (const r of [...tsd, ...acd, ...v]) expect(r.validated_at).toBeNull();
  });

  it.skipIf(!url || !anon)(
    "a blocked file can't be downloaded from storage without signing in",
    async () => {
      const path =
        "agency/5deb59a4-3c84-44ab-b234-b18e71b1039c/link/d0633a35-a377-4251-9643-65462f563522/requests/44ace112-a893-4b03-b41f-7f66a1343ac5/1785179957732-TalVault_Logo_-_Light__Teal_.svg";
      const res = await fetch(`${url}/storage/v1/object/authenticated/talent-documents/${path}`, {
        headers: { apikey: anon! },
      });
      expect(res.ok).toBe(false);
    },
  );
});
