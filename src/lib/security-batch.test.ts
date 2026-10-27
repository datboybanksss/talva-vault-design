import { describe, expect, it, vi } from "vitest";
import {
  allowedMimeClaim,
  mimeClaimMatches,
  documentIsValidated,
  fileResponseHeaders,
  KIND_MIME,
} from "./file-security";
import { detectKind } from "./file-validation.server";
import { shareHasCode, privateStoragePathOwned, privateFolderOwned } from "./share-security";
import { billingDocumentBelongsToLinks, billingLinkReadable } from "./billing-share-core";
import { billingSenderPage, escapeHtml } from "./billing-sender-page";
import { exactIlike, sameEmail } from "./invite-email-check";
import { databaseError } from "./security-errors";

describe("TVA-SEC-102 upload and response boundary", () => {
  it("rejects an HTML claim even with innocent text bytes", () => {
    expect(allowedMimeClaim("text/html")).toBe(false);
    expect(mimeClaimMatches("text/html", "text")).toBe(false);
    expect(
      detectKind(new TextEncoder().encode("<!-- comment --> <svg onload='alert(1)'></svg>")),
    ).toBeNull();
  });
  it("requires a completed validation stamp", () => {
    expect(documentIsValidated({ validated_at: null })).toBe(false);
    expect(documentIsValidated({ validated_at: "garbage" })).toBe(false);
    expect(documentIsValidated({ validated_at: "2026-10-25T00:00:00Z" })).toBe(true);
  });
  it("never serves SVG or text inline, and supplies sandbox and nosniff", () => {
    for (const mime of ["image/svg+xml", "text/html", KIND_MIME.text]) {
      const headers = fileResponseHeaders(mime, "document.svg");
      expect(headers.get("Content-Disposition")).toMatch(/^attachment;/);
      expect(headers.get("Content-Security-Policy")).toContain("sandbox;");
      expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
    expect(fileResponseHeaders(KIND_MIME.pdf, "document.pdf").get("Content-Disposition")).toMatch(
      /^inline;/,
    );
  });
});
it("TVA-SEC-103 refuses missing or empty code hashes", () => {
  expect(shareHasCode(null)).toBe(false);
  expect(shareHasCode(" ")).toBe(false);
  expect(shareHasCode("hash")).toBe(true);
});
it("TVA-SEC-104 matches billing only to owned link and agency IDs", () => {
  const links = [{ id: "own-link", agency_id: "agency-one" }];
  expect(
    billingDocumentBelongsToLinks({ talent_link_id: "other-link", agency_id: "agency-one" }, links),
  ).toBe(false);
  expect(
    billingDocumentBelongsToLinks({ talent_link_id: "own-link", agency_id: "agency-two" }, links),
  ).toBe(false);
  expect(
    billingDocumentBelongsToLinks({ talent_link_id: "own-link", agency_id: "agency-one" }, links),
  ).toBe(true);
  expect(
    billingLinkReadable(
      { status: "ended", read_until: "2026-10-24T00:00:00Z" },
      Date.parse("2026-10-25T00:00:00Z"),
    ),
  ).toBe(false);
});
it("TVA-SEC-105 escapes stored values and offers POST confirmation", async () => {
  expect(escapeHtml('<img src=x onerror="attack()">')).toBe(
    "&lt;img src=x onerror=&quot;attack()&quot;&gt;",
  );
  const html = await billingSenderPage(
    "Confirm",
    "<script>attack()</script>",
    200,
    'token"bad',
  ).text();
  expect(html).not.toContain("<script>");
  expect(html).toContain('<form method="post">');
  expect(html).toContain("token&quot;bad");
});
it("TVA-SEC-106 email underscore is literal, never another address", () => {
  expect(exactIlike("qa_owner@example.test")).toBe("qa\\_owner@example.test");
  expect(sameEmail("qa_owner@example.test", "qaXowner@example.test")).toBe(false);
  expect(sameEmail("QA_OWNER@example.test", "qa_owner@example.test")).toBe(true);
});
it("TVA-SEC-108 does not expose database detail", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(
    databaseError({ code: "42501", message: "permission denied for table private_data" }).message,
  ).toBe("You don't have permission to do that.");
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
it("TVA-SEC-111 refuses foreign or traversed private paths", () => {
  expect(privateStoragePathOwned("other/file.pdf", "owner")).toBe(false);
  expect(privateStoragePathOwned("owner/../file.pdf", "owner")).toBe(false);
  expect(privateStoragePathOwned("owner/file.pdf", "owner")).toBe(true);
});
it("TVA-SEC-111 requires a caller-owned folder that is not removed", () => {
  expect(privateFolderOwned({ user_id: "other", removed_at: null }, "caller")).toBe(false);
  expect(
    privateFolderOwned({ user_id: "caller", removed_at: "2026-10-25T00:00:00Z" }, "caller"),
  ).toBe(false);
  expect(privateFolderOwned({ user_id: "caller", removed_at: null }, "caller")).toBe(true);
});
