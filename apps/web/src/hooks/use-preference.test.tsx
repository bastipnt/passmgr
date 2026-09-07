import { clearPreferenceCache, PreferencesProvider, usePreference } from "@repo/client";
import { act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

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

  it("keeps bare strings written before values were JSON-encoded", () => {
    localStorage.setItem(KEY, "alphabetical");

    renderWithProviders(
      <Wrapper>
        <Reader testId="a" fallback="most-recent" />
      </Wrapper>,
    );

    expect(screen.getByTestId("a").textContent).toBe(JSON.stringify("alphabetical"));
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
