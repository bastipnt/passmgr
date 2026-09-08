import { clearPreferenceCache, PREF_KEYS, useCopyToClipboard } from "@repo/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders, screen } from "@/test/render";

const write = vi.fn<(text: string) => void>();

function Copier({ value = "hunter2" }: { value?: string }) {
  const copy = useCopyToClipboard(write);
  return (
    <button type="button" onClick={() => copy(value)}>
      copy
    </button>
  );
}

function copy(value?: string) {
  renderWithProviders(<Copier value={value} />);
  screen.getByRole("button", { name: "copy" }).click();
}

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearPreferenceCache();
    write.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("writes the value and clears it after the configured delay", () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(15));

    copy();
    expect(write).toHaveBeenCalledExactlyOnceWith("hunter2");

    vi.advanceTimersByTime(15_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("");
  });

  it("never clears when the preference is 0", () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(0));

    copy();
    vi.advanceTimersByTime(10 * 60_000);

    expect(write).toHaveBeenCalledExactlyOnceWith("hunter2");
  });

  it("does nothing for an empty value", () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(15));

    copy("");
    vi.advanceTimersByTime(15_000);

    expect(write).not.toHaveBeenCalled();
  });
});
