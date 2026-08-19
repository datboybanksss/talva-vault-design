/**
 * Behaviour contract for the filing review popup.
 *
 * Guards the UX rules that are easy to regress: the AI suggestion only pre-fills
 * the fields, every field is editable immediately (no unlock step), there is no
 * reject path, and "Save filing" writes exactly what is in the fields at the time.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const catalog = [
  { id: "f-identity", label: "Identity & Personal" },
  { id: "f-passport", label: "Identity & Personal → Passport" },
  { id: "f-id", label: "Identity & Personal → ID documents" },
  { id: "f-travel", label: "Travel & Visas" },
  { id: "f-visa", label: "Travel & Visas → Visas" },
];

const confirmSpy = vi.fn(async (_data: any) => ({ ok: true }));
const skipSpy = vi.fn(async (_data: any) => ({ ok: true }));
const catalogSpy = vi.fn(async (_data?: any) => ({
  catalog,
  defaultReminderDays: 30,
  secondaryHint: "This stays in your Private Vault.",
  currentDestination: "f-passport",
  fileName: "passport.pdf",
}));

vi.mock("@/lib/ai-filing.functions", () => ({
  getFilingCatalog: "getFilingCatalog",
  confirmDocumentFiling: "confirmDocumentFiling",
  skipDocumentFiling: "skipDocumentFiling",
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) =>
    fn === "getFilingCatalog"
      ? ({ data }: any) => catalogSpy(data)
      : fn === "confirmDocumentFiling"
        ? ({ data }: any) => confirmSpy(data)
        : ({ data }: any) => skipSpy(data),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AiFilingReviewModal } from "./ai-filing-review-modal";

function renderModal(onDone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AiFilingReviewModal
        scope="talent"
        documentId="11111111-1111-1111-1111-111111111111"
        documentName="passport.pdf"
        destinationPrefix="Private Vault"
        suggestion={{
          folder_id: "f-passport",
          expiry_date: "2030-01-31",
          reminder_lead_days: 30,
          confidence: "high",
          rationale: null,
        }}
        onClose={vi.fn()}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return onDone;
}

const folderSelect = () => screen.getByLabelText("Destination folder") as HTMLSelectElement;
const subSelect = () => screen.getByLabelText("Destination subfolder") as HTMLSelectElement;
const expiryInput = () => screen.getByLabelText("Expiry date") as HTMLInputElement;
const leadInput = () => screen.getByLabelText("Reminder lead days") as HTMLInputElement;

describe("AiFilingReviewModal", () => {
  beforeEach(() => {
    confirmSpy.mockClear();
    skipSpy.mockClear();
  });

  it("pre-fills folder, subfolder and expiry from the AI suggestion, all editable immediately", async () => {
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    expect(folderSelect().value).toBe("Identity & Personal");
    expect(subSelect().value).toBe("f-passport");
    expect(expiryInput().value).toBe("2030-01-31");
    expect(leadInput().value).toBe("30");

    // No unlock step: nothing is disabled and there is no edit/confirm gate.
    expect(folderSelect().disabled).toBe(false);
    expect(subSelect().disabled).toBe(false);
    expect(expiryInput().disabled).toBe(false);
    expect(leadInput().disabled).toBe(false);
    expect(screen.queryByText(/choose different folder/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^confirm$/i })).toBeNull();
  });

  it("has no reject path, and keeps the human validation notice", async () => {
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
    expect(screen.getByText(/Human validation required/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Save filing/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip for now/i })).toBeDefined();
  });

  it("saves the untouched suggestion as-is", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      destination: "f-passport",
      expires_at: "2030-01-31T00:00:00.000Z",
      reminder_at: "2030-01-01T09:00:00.000Z",
    });
  });

  it("saves exactly what the user edited — folder, subfolder, expiry and lead time", async () => {
    const user = userEvent.setup();
    const onDone = renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    await user.selectOptions(folderSelect(), "Travel & Visas");
    expect(subSelect().value).toBe(""); // resets when the parent changes
    await user.selectOptions(subSelect(), "f-visa");

    await user.clear(expiryInput());
    await user.type(expiryInput(), "2027-06-15");
    await user.clear(leadInput());
    await user.type(leadInput(), "14");

    // Provenance flips to the human once a field is touched.
    expect(screen.getAllByText(/Edited by you/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("reminder-summary").textContent).toContain("2027-06-01");

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      destination: "f-visa",
      expires_at: "2027-06-15T00:00:00.000Z",
      reminder_at: "2027-06-01T09:00:00.000Z",
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables the reminder lead time when there is no expiry date", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(expiryInput()).toBeDefined());

    await user.clear(expiryInput());
    await waitFor(() => expect(leadInput().disabled).toBe(true));
    expect(screen.getByTestId("reminder-summary").textContent).toMatch(/No expiry set/i);

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      expires_at: null,
      reminder_at: null,
    });
  });
});
