import { applyStoredAccent, ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_STORAGE_KEY } from "@repo/ui-shared";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import AppearanceSettingsPage from "./AppearanceSettingsPage";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  isMobile: () => viewport.mobile,
}));

const KEY = "test-theme";

const root = document.documentElement;

function renderPage() {
  return renderWithProviders(
    <ThemeProvider storageKey={KEY}>
      <AppearanceSettingsPage />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  viewport.mobile = false;
  localStorage.clear();
  delete root.dataset.accent;
});
afterEach(() => {
  delete root.dataset.accent;
});

describe("accent picker", () => {
  it("defaults to Berry on a fresh device", () => {
    renderPage();

    expect(screen.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true");
    expect(root.dataset.accent).toBe("berry");
  });

  it("stores the picked accent and applies it at once", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("radio", { name: "Pine" }));

    expect(root.dataset.accent).toBe("pine");
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("pine");
    expect(screen.getByRole("radio", { name: "Pine" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "false");
  });

  it("moves through the presets with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("radiogroup", { name: "Accent" })).toBeInTheDocument();

    screen.getByRole("radio", { name: "Berry" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Violet" })).toHaveFocus();
    expect(root.dataset.accent).toBe("violet");
  });

  it("applies the stored accent before rendering", () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, "ember");

    applyStoredAccent();

    expect(root.dataset.accent).toBe("ember");
  });

  it("falls back to Berry for an unknown stored accent", () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, "teal");

    applyStoredAccent();
    expect(root.dataset.accent).toBe("berry");

    renderPage();
    expect(screen.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("Appearance page", () => {
  it("picks the theme from the segmented control", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(localStorage.getItem(KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers English only, the language picker turned off", () => {
    renderPage();

    expect(screen.getByRole("combobox", { name: "Language" })).toBeDisabled();
    expect(screen.getByText("More languages are coming.")).toBeTruthy();
    expect(screen.queryByText(/website icons/i)).toBeNull();
  });

  it("picks the sort order from a sheet on a phone", async () => {
    viewport.mobile = true;
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Default sort order" }));
    await user.click(await screen.findByRole("button", { name: "Alphabetical" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Default sort order" })).toHaveAccessibleDescription(
      "Alphabetical",
    );
  });
});
