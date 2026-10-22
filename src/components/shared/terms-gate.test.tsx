import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TermsGate } from "./terms-gate";

const spies = vi.hoisted(() => ({ status: vi.fn(), accept: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/terms-acceptance.functions", () => ({ getMyTermsStatus: "status", acceptCurrentTerms: "accept" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: "status" | "accept") => spies[fn] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: { success: spies.success, error: spies.error } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Terms gate agreement", () => {
  it.each(["agency owner", "agency staff", "talent"])("submits the displayed document and hash for %s", async (role) => {
    const portal = role === "talent" ? "talent" : "agency";
    const id = portal === "agency" ? "2908166d-8ecf-42f7-94bd-f0752084a87b" : "316ca0dc-a390-4525-b444-0729118bf4bb";
    const body_sha256 = "a".repeat(64);
    const current = { id, title: "Test document", version: "v1.1", body: "Test-only non-legal fixture", body_sha256, effective_at: "2026-09-09T09:01:02Z" };
    spies.status.mockResolvedValue({ required: true, current, acceptances: [] });
    spies.accept.mockImplementation(async () => {
      spies.status.mockResolvedValue({ required: false, current, acceptances: [] });
      return { proof_ref: "test-proof" };
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><TermsGate portal={portal}><div>Portal content</div></TermsGate></QueryClientProvider>);
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Portal content")).toBeNull();
    const panel = screen.getByRole("region");
    Object.defineProperties(panel, { clientHeight: { value: 380 }, scrollHeight: { value: 1800 }, scrollTop: { value: 1419, writable: true } });
    fireEvent.scroll(panel);
    expect(checkbox.hasAttribute("disabled")).toBe(true);
    panel.scrollTop = 1420;
    fireEvent.scroll(panel);
    expect(checkbox.hasAttribute("disabled")).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await waitFor(() => expect(spies.accept).toHaveBeenCalledWith({ data: { portal, document_id: id, body_sha256 } }));
    await screen.findByText("Portal content");
  });
});