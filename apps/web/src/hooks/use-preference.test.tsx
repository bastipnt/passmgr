import {
  clearPreferenceCache,
  PreferencesProvider,
  useGeneratorDefaults,
  usePreference,
} from "@repo/client";
import { PASSWORD_DEFAULTS } from "@repo/crypto";
import { applyStoredAccent, ThemeProvider, useTheme } from "@repo/ui/providers/ThemeProvider";
import { act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders, screen } from "@/test/render";

import { usePreferencesStore } from "./use-preferences-store";

function Wrapper({ children }: { children: ReactNode }) {
  return <PreferencesProvider store={usePreferencesStore()}>{children}</PreferencesProvider>;
}

const KEY = "test-pref";

function Reader({ testId, fallback }: { testId: string; fallback: unknown }) {
  const [value] = usePreference(KEY, fallback);
  return <span data-testid={testId}>{JSON.stringify(value)}</span>;
}

const isNumber = (value: unknown): value is number => typeof value === "number";

function ValidatedReader() {
  const [value] = usePreference(KEY, 15, isNumber);
  return <span data-testid="v">{JSON.stringify(value)}</span>;
}

function GeneratorReader() {
  const { pwOpts } = useGeneratorDefaults();
  return <span data-testid="pw">{JSON.stringify(pwOpts)}</span>;
}

function ThemeReader() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

function Writer({ fallback }: { fallback: unknown }) {
  const [, setValue] = usePreference(KEY, fallback);
  return (
    <button type="button" onClick={() => setValue({ length: 32 })}>
      write
    </button>
  );
}

describe("usePreference", () => {
  beforeEach(() => {
    localStorage.clear();
    clearPreferenceCache();
  });

  it("falls back to the default when the stored value is not valid JSON", () => {
    localStorage.setItem(KEY, "{{{");

    renderWithProviders(
      <Wrapper>
        <Reader testId="a" fallback={{ length: 16 }} />
      </Wrapper>,
    );

    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify({ length: 16 }));
  });

  it("reads a string that isn't JSON-encoded as the default", () => {
    localStorage.setItem(KEY, "alphabetical");

    renderWithProviders(
      <Wrapper>
        <Reader testId="a" fallback="most-recent" />
      </Wrapper>,
    );

    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify("most-recent"));
  });

  it("falls back to the default when the stored value fails validation", () => {
    localStorage.setItem(KEY, JSON.stringify("15"));

    renderWithProviders(
      <Wrapper>
        <ValidatedReader />
      </Wrapper>,
    );

    expect(screen.getByTestId("v").textContent).toBe("15");
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify("15"));
  });

  it("notifies every subscriber on the same key", async () => {
    renderWithProviders(
      <Wrapper>
        <Reader testId="a" fallback={{ length: 16 }} />
        <Writer fallback={{ length: 16 }} />
      </Wrapper>,
    );

    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify({ length: 16 }));

    await act(async () => {
      screen.getByRole("button", { name: "write" }).click();
    });

    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify({ length: 32 }));
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ length: 32 }));
  });
});

describe("blocked or corrupt storage", () => {
  beforeEach(() => {
    localStorage.clear();
    clearPreferenceCache();
  });

  it.each([
    ["an out-of-range length", { ...PASSWORD_DEFAULTS, length: 1e9 }, PASSWORD_DEFAULTS],
    [
      "minimums over the length",
      { ...PASSWORD_DEFAULTS, length: 8, minDigits: 9 },
      PASSWORD_DEFAULTS,
    ],
    ["an option missing", { length: 24 }, { ...PASSWORD_DEFAULTS, length: 24 }],
  ])("generator options with %s", (_, stored, expected) => {
    localStorage.setItem("pass-mgr-generator-password-options", JSON.stringify(stored));

    renderWithProviders(
      <Wrapper>
        <GeneratorReader />
      </Wrapper>,
    );

    expect(JSON.parse(screen.getByTestId("pw").textContent ?? "")).toEqual(expected);
  });

  it("an invalid stored theme reads as the default theme", () => {
    localStorage.setItem("theme-key", "neon");

    renderWithProviders(
      <ThemeProvider storageKey="theme-key" defaultTheme="dark">
        <ThemeReader />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("renders with defaults when storage throws", async () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);

    applyStoredAccent();
    renderWithProviders(
      <ThemeProvider storageKey="theme-key" defaultTheme="dark">
        <ThemeReader />
        <Reader testId="a" fallback={{ length: 16 }} />
        <Writer fallback={{ length: 16 }} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify({ length: 16 }));
    await act(async () => {
      screen.getByRole("button", { name: "write" }).click();
    });
    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify({ length: 16 }));
  });
});
