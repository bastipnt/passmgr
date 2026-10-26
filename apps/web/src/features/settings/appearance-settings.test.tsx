import { applyStoredAccent, ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import GeneralSettingsPage from "./GeneralSettingsPage";

const KEY = "test-theme";
const ACCENT_KEY = `${KEY}-accent`;

const root = document.documentElement;

function renderPage() {
  return renderWithProviders(
    <ThemeProvider storageKey={KEY}>
      <GeneralSettingsPage />
    </ThemeProvider>,
  );
}

beforeEach(() => {
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
    expect(localStorage.getItem(ACCENT_KEY)).toBe("pine");
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
    localStorage.setItem(ACCENT_KEY, "ember");

    applyStoredAccent(KEY);

    expect(root.dataset.accent).toBe("ember");
  });

  it("falls back to Berry for an unknown stored accent", () => {
    localStorage.setItem(ACCENT_KEY, "teal");

    applyStoredAccent(KEY);
    expect(root.dataset.accent).toBe("berry");

    renderPage();
    expect(screen.getByRole("radio", { name: "Berry" })).toHaveAttribute("aria-checked", "true");
  });
});
