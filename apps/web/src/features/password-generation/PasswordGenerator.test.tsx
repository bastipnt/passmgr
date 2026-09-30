import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import PasswordGenerator from "./PasswordGenerator";

const mobileMatch = vi.hoisted(() => vi.fn());

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => mobileMatch(),
  isMobile: () => mobileMatch(),
}));

function renderOpen() {
  const handle = createHandle();
  const onUse = vi.fn();
  renderWithProviders(
    <>
      <DialogTrigger handle={handle}>Generate</DialogTrigger>
      <PasswordGenerator handle={handle} onUse={onUse} />
    </>,
  );
  return { onUse };
}

describe("PasswordGenerator", () => {
  beforeEach(() => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  describe.each([
    ["desktop", false],
    ["phone", true],
  ])("on %s", (_, mobile) => {
    beforeEach(() => {
      mobileMatch.mockReturnValue(mobile);
    });

    it("names its actions and announces a copy", async () => {
      const user = userEvent.setup();
      renderOpen();
      await user.click(screen.getByRole("button", { name: "Generate" }));

      const copy = await screen.findByRole("button", { name: "Copy" });
      expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use" })).toBeInTheDocument();

      await waitFor(() => expect(copy).toBeEnabled());
      await user.click(copy);
      expect(await screen.findByText("Copied", { selector: "[aria-live]" })).toBeInTheDocument();
    });
  });

  it("closes from the phone drawer's X", async () => {
    mobileMatch.mockReturnValue(true);
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await user.click(await screen.findByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
