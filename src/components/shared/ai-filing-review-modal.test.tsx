/**
 * Behaviour contract for the filing review popup.
 *
 * Guards the UX rules that are easy to regress: a suggestion only pre-fills the
 * fields, every field is editable immediately (no unlock step), there is no
 * reject path, and "Save filing" writes exactly what is in the fields at the
 * time. A filename guess is labelled "Suggested · Based on the file name" —
 * never "Suggested by AI" — and is recorded with source 'filename'. In manual
 * mode (AI switch off, or nothing matched) no badges show at all and every
 * saved value is source 'user'.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
const catalogSpy = vi.fn(async (_data?: any): Promise<any> => ({
  catalog,
  defaultReminderDays: 30,
  secondaryHint: "This stays in your Private Vault.",
  currentDestination: "f-passport",
  fileName: "passport.pdf",
  aiEnabled: true,
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

const AI_SUGGESTION = {
  folder_id: "f-passport",
  expiry_date: "2030-01-31",
  reminder_lead_days: 30,
  confidence: "high" as const,
  rationale: null,
};

function renderModal(onDone = vi.fn(), opts: { suggestion?: any; fileName?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AiFilingReviewModal
        scope="talent"
        documentId="11111111-1111-1111-1111-111111111111"
        documentName={opts.fileName ?? "passport.pdf"}
        destinationPrefix="Private Vault"
        suggestion={opts.suggestion === undefined ? AI_SUGGESTION : opts.suggestion}
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

describe("AiFilingReviewModal — AI suggestion mode", () => {
  beforeEach(() => {
    confirmSpy.mockClear();
    skipSpy.mockClear();
    catalogSpy.mockClear();
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

  it("labels untouched AI-suggested fields as 'Suggested by AI'", async () => {
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());
    expect(screen.getAllByText(/Suggested by AI/i).length).toBeGreaterThan(0);
  });

  it("has no reject path, and keeps the human validation notice", async () => {
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
    expect(screen.getByText(/Human validation required/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Save filing/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip for now/i })).toBeDefined();
  });

  it("saves the untouched suggestion as-is, with 'ai' sources", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(folderSelect()).toBeDefined());

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      destination: "f-passport",
      expires_at: "2030-01-31T00:00:00.000Z",
      reminder_at: "2030-01-01T09:00:00.000Z",
      folder_source: "ai",
      expiry_source: "ai",
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
    expect(leadInput().value).toBe(""); // clearing does not snap back to a value
    fireEvent.change(leadInput(), { target: { value: "14" } });

    // Provenance flips to the human once a field is touched.
    expect(screen.getAllByText(/Edited by you/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("reminder-summary").textContent).toContain("2027-06-01");

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      destination: "f-visa",
      expires_at: "2027-06-15T00:00:00.000Z",
      reminder_at: "2027-06-01T09:00:00.000Z",
      folder_source: "user",
      expiry_source: "user",
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

describe("AiFilingReviewModal — filename guess mode", () => {
  beforeEach(() => {
    confirmSpy.mockClear();
    skipSpy.mockClear();
    catalogSpy.mockClear();
  });

  it("labels the guess 'Suggested' with 'Based on the file name' — never 'Suggested by AI'", async () => {
    renderModal(vi.fn(), { suggestion: null, fileName: "passport.pdf" });
    await waitFor(() => expect(folderSelect().value).toBe("Identity & Personal"));

    expect(screen.getAllByText(/^Suggested$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Based on the file name/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Suggested by AI/i)).toBeNull();
    expect(screen.queryByText(/Where did this come from/i)).toBeNull();
  });

  it("records the saved values with source 'filename'", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn(), { suggestion: null, fileName: "passport.pdf" });
    await waitFor(() => expect(folderSelect().value).toBe("Identity & Personal"));

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      destination: "f-identity",
      folder_source: "filename",
      expiry_source: "user", // no date in the file name, so expiry stayed empty/user
    });
  });
});

describe("AiFilingReviewModal — manual mode (AI switch off)", () => {
  beforeEach(() => {
    confirmSpy.mockClear();
    skipSpy.mockClear();
    catalogSpy.mockClear();
  });

  it("shows no suggestion badges and no provenance link", async () => {
    catalogSpy.mockResolvedValueOnce({
      catalog,
      defaultReminderDays: 30,
      secondaryHint: null,
      currentDestination: "f-passport",
      fileName: "passport.pdf",
      aiEnabled: false,
    });
    renderModal(vi.fn(), { suggestion: null });
    await waitFor(() => expect(folderSelect().value).toBe("Identity & Personal"));

    expect(screen.queryByText(/Suggested by AI/i)).toBeNull();
    expect(screen.queryByText(/^Suggested$/i)).toBeNull();
    expect(screen.queryByText(/Where did this come from/i)).toBeNull();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it("saves every value with source 'user'", async () => {
    const user = userEvent.setup();
    catalogSpy.mockResolvedValueOnce({
      catalog,
      defaultReminderDays: 30,
      secondaryHint: null,
      currentDestination: "f-passport",
      fileName: "passport.pdf",
      aiEnabled: false,
    });
    renderModal(vi.fn(), { suggestion: null });
    await waitFor(() => expect(folderSelect().value).toBe("Identity & Personal"));

    await user.click(screen.getByRole("button", { name: /Save filing/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect((confirmSpy.mock.calls[0] as any[])[0]).toMatchObject({
      folder_source: "user",
      expiry_source: "user",
    });
  });

  it("requires a folder choice when the document was uploaded with none", async () => {
    catalogSpy.mockResolvedValueOnce({
      catalog,
      defaultReminderDays: 30,
      secondaryHint: null,
      currentDestination: null,
      fileName: "scan.pdf",
      aiEnabled: false,
    });
    renderModal(vi.fn(), { suggestion: null, fileName: "scan.pdf" });
    await waitFor(() => expect(folderSelect()).toBeDefined());

    const saveBtn = screen.getByRole("button", { name: /Save filing/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    const user = userEvent.setup();
    await user.selectOptions(folderSelect(), "Travel & Visas");
    await user.selectOptions(subSelect(), "f-visa");
    expect(saveBtn.disabled).toBe(false);
  });

  it("Skip for now still works in manual mode", async () => {
    const user = userEvent.setup();
    catalogSpy.mockResolvedValueOnce({
      catalog,
      defaultReminderDays: 30,
      secondaryHint: null,
      currentDestination: null,
      fileName: "scan.pdf",
      aiEnabled: false,
    });
    const onDone = renderModal(vi.fn(), { suggestion: null, fileName: "scan.pdf" });
    await waitFor(() => expect(folderSelect()).toBeDefined());

    await user.click(screen.getByRole("button", { name: /Skip for now/i }));
    await waitFor(() => expect(skipSpy).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
