import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccessibleModal } from "./accessible-modal";

afterEach(cleanup);

function Example({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Outside</button>
      {open && (
        <AccessibleModal onClose={() => { setOpen(false); onClose(); }}>
          <div data-testid="backdrop">
            <div onClick={(e) => e.stopPropagation()}>
              <h2>Example dialog</h2>
              <button>First</button>
              <button>Last</button>
            </div>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}

describe("accessible custom dialogs", () => {
  it("keeps keyboard focus inside, closes with Escape and restores the opener", async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<Example onClose={closed} />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await screen.findByRole("dialog", { name: "Example dialog" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" })));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    await user.keyboard("{Escape}");
    expect(closed).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes only when the backdrop itself is clicked", async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<Example onClose={closed} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(closed).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("backdrop"));
    expect(closed).toHaveBeenCalledOnce();
  });
});