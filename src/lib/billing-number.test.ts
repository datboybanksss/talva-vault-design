import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createDraftBillingNumber } from "./billing-number";
import { friendlyError } from "./friendly-error";

const fixtures = vi.hoisted(() => ({ context: {} as object }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((data: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: (data: unknown) => unknown) => {
        validate = fn;
        return builder;
      },
      handler:
        (fn: (input: { context: object; data: unknown }) => unknown) =>
        (input: { data?: unknown } = {}) =>
          fn({ context: fixtures.context, data: validate ? validate(input.data) : input.data }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => undefined }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./terms-guard", () => ({ assertTermsAccepted: async () => undefined }));
import { createInvoiceForContract, reserveAgencyInvoiceNumber } from "./agency.functions";

const agencyId = "11111111-1111-4111-8111-111111111111";
const contractId = "22222222-2222-4222-8222-222222222222";
const requests: { url: URL; method: string; body: unknown }[] = [];
let duplicate = false;
let lookupFails = false;
const client = createClient<Database>("https://database.example.test", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const table = url.pathname.split("/").pop();
      let response: unknown = null;
      if (table === "agency_members")
        response = { agency_id: agencyId, role: "owner", suspended: false };
      else if (table === "mint_billing_doc_number") response = "INV-2026-0042";
      else if (url.pathname.includes("/rpc/")) response = true;
      else if (table === "talent_shared_documents")
        response = {
          id: contractId,
          name: "Contract",
          talent_link_id: null,
          contract_client_name: null,
          contract_currency: "ZAR",
        };
      else if (table === "agency_billing_docs") {
        if (method === "GET") {
          if (lookupFails)
            return new Response(JSON.stringify({ code: "XX000", message: "query failed" }), {
              status: 500,
            });
          response = duplicate ? [{ id: "existing" }] : [];
        } else response = { id: "created", number: "INV-2026-0042" };
      }
      return new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
      });
    },
  },
});
const payload = { contract_id: contractId, number: "INV-2026-0042", total_cents: 10000 };

beforeEach(() => {
  requests.length = 0;
  duplicate = false;
  lookupFails = false;
  fixtures.context = { supabase: client, userId: "test-owner", claims: {} };
  vi.restoreAllMocks();
});

describe("Billing number remediation", () => {
  it("uses six cryptographic base-32 characters for DRAFT labels", () => {
    const random = vi.spyOn(globalThis.crypto, "getRandomValues");
    random.mockReturnValueOnce(new Uint8Array([0, 1, 2, 3, 4, 31]));
    expect(createDraftBillingNumber()).toBe("DRAFT-01234Z");
    expect(random).toHaveBeenCalledWith(new Uint8Array(6));
  });
  it("reserves invoice defaults through the existing agency invoice counter", async () => {
    expect(await reserveAgencyInvoiceNumber()).toBe("INV-2026-0042");
    expect(requests.find((r) => r.url.pathname.endsWith("/mint_billing_doc_number"))?.body).toEqual(
      { _agency_id: agencyId, _kind: "invoice" },
    );
  });
  it("rejects an existing same-agency invoice number before any insert", async () => {
    duplicate = true;
    await expect(createInvoiceForContract({ data: payload })).rejects.toThrow(
      "INVOICE_NUMBER_EXISTS:",
    );
    expect(
      requests.some((r) => r.method === "POST" && r.url.pathname.endsWith("/agency_billing_docs")),
    ).toBe(false);
    const lookup = requests.find((r) => r.url.pathname.endsWith("/agency_billing_docs"));
    expect(lookup?.url.searchParams.get("agency_id")).toBe(`eq.${agencyId}`);
    expect(lookup?.url.searchParams.get("kind")).toBe("eq.invoice");
    expect(lookup?.url.searchParams.get("number")).toBe("eq.INV-2026-0042");
  });
  it("allows the number when the agency has no matching invoice", async () => {
    expect(await createInvoiceForContract({ data: payload })).toEqual({
      id: "created",
      number: payload.number,
    });
  });
  it("checks the trimmed number that will actually be stored", async () => {
    await createInvoiceForContract({ data: { ...payload, number: ` ${payload.number} ` } });
    const lookup = requests.find(
      (r) => r.method === "GET" && r.url.pathname.endsWith("/agency_billing_docs"),
    );
    expect(lookup?.url.searchParams.get("number")).toBe(`eq.${payload.number}`);
  });
  it("refuses creation when the duplicate lookup fails", async () => {
    lookupFails = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createInvoiceForContract({ data: payload })).rejects.toThrow(
      "We couldn't complete that request.",
    );
    expect(
      requests.some((r) => r.method === "POST" && r.url.pathname.endsWith("/agency_billing_docs")),
    ).toBe(false);
  });
  it("keeps the duplicate refusal readable through the existing error helper", () => {
    expect(
      friendlyError(
        new Error(
          "INVOICE_NUMBER_EXISTS: This agency already has an invoice with that number. Please choose a different number.",
        ),
      ),
    ).toBe(
      "This agency already has an invoice with that number. Please choose a different number.",
    );
  });
});
