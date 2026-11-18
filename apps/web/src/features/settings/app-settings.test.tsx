import { PASSWORD_DEFAULTS } from "@repo/crypto";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "@/lib/shortcuts";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import GeneratorSettingsPage from "./GeneratorSettingsPage";
import SecuritySettingsPage from "./SecuritySettingsPage";
import ShortcutsSettingsPage from "./ShortcutsSettingsPage";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  isMobile: () => viewport.mobile,
}));

beforeEach(() => {
  viewport.mobile = false;
  localStorage.clear();
});

describe("Security page", () => {
  it("groups locking, secrets on screen and privacy, with website icons off by default", () => {
    renderWithProviders(<SecuritySettingsPage />);

    for (const group of ["Locking", "Secrets on screen", "Privacy"])
      expect(screen.getByRole("heading", { name: group })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Lock when idle" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Show website icons" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Go to Account" })).toBeTruthy();
  });

  it("turns website icons on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SecuritySettingsPage />);

    await user.click(screen.getByRole("switch", { name: "Show website icons" }));

    expect(screen.getByRole("switch", { name: "Show website icons" })).toBeChecked();
  });

  it("shows each duration as a drill-down row on a phone", async () => {
    viewport.mobile = true;
    const user = userEvent.setup();
    renderWithProviders(<SecuritySettingsPage />);

    const row = screen.getByRole("button", { name: "Lock when idle" });
    await user.click(row);
    await user.click(await screen.findByRole("button", { name: "After 5 minutes" }));

    await waitFor(() => expect(row).toHaveAccessibleDescription("5 minutes"));
    expect(screen.getByRole("link", { name: "Two-factor and password" })).toBeTruthy();
  });
});

describe("Password generator page", () => {
  it("shows a sample of the defaults and regenerates it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratorSettingsPage />);
    const sample = screen.getByRole("region", { name: "Sample" });

    await waitFor(() =>
      expect(within(sample).getByText(/\S/, { selector: "code" }).textContent).toHaveLength(
        PASSWORD_DEFAULTS.length,
      ),
    );
    const first = sample.querySelector("code")!.textContent;
    await user.click(screen.getByRole("button", { name: "Generate another sample" }));
    await waitFor(() => expect(sample.querySelector("code")!.textContent).not.toBe(first));
  });

  it("asks for at least one digit and symbol, and keeps the last character set on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratorSettingsPage />);

    expect(screen.getAllByText("At least 1")).toHaveLength(2);
    expect(screen.queryByLabelText(/Min digits/)).toBeNull();

    await user.click(screen.getByRole("switch", { name: "Uppercase A–Z" }));
    await user.click(screen.getByRole("switch", { name: "Digits 0–9" }));
    await user.click(screen.getByRole("switch", { name: "Symbols !@#$" }));

    expect(
      screen
        .getByRole("switch", { name: "Lowercase a–z" })
        .matches("[disabled], [aria-disabled='true'], [data-disabled]"),
    ).toBe(true);
    expect(screen.queryByText("At least 1")).toBeNull();
    const stored = JSON.parse(
      Object.values(localStorage).find((value) => value.includes('"minDigits"')) ?? "{}",
    );
    expect(stored).toMatchObject({ digits: false, minDigits: 0, symbols: false, minSymbols: 0 });
  });

  it("switches to the passphrase defaults and resets everything", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneratorSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Passphrase" }));
    expect(screen.getByRole("heading", { name: "Words" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Characters" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByRole("heading", { name: "Characters" })).toBeTruthy();
  });
});

describe("Keyboard shortcuts page", () => {
  it("lists every shortcut of the app in its group", () => {
    renderWithProviders(<ShortcutsSettingsPage />);

    const vault = screen.getByRole("list", { name: "Vault" });
    const app = screen.getByRole("list", { name: "App" });
    expect(within(vault).getByText(SHORTCUTS.focusSearch.description)).toBeTruthy();
    expect(within(vault).getByText(SHORTCUTS.copyPassword.description)).toBeTruthy();
    expect(within(app).getByText("Close settings")).toBeTruthy();
    expect(within(app).getByText("Esc")).toBeTruthy();
    expect(
      within(vault).getAllByRole("listitem").length + within(app).getAllByRole("listitem").length,
    ).toBe(Object.keys(SHORTCUTS).length);
  });
});
