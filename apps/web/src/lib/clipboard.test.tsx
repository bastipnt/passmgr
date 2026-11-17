import { clearPreferenceCache, flushClipboardClear, PREF_KEYS } from "@repo/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopySecret } from "@/lib/clipboard";
import { renderWithProviders, screen } from "@/test/render";

const writeText = vi.fn<(text: string) => Promise<void>>();

function Copier({ value = "hunter2" }: { value?: string }) {
  const copy = useCopySecret();
  return (
    <button type="button" onClick={() => void copy(value)}>
      copy
    </button>
  );
}

async function copy(value?: string) {
  renderWithProviders(<Copier value={value} />);
  screen.getByRole("button", { name: "copy" }).click();
  await vi.advanceTimersByTimeAsync(0);
}

describe("useCopySecret", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearPreferenceCache();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(async () => {
    await flushClipboardClear();
    vi.useRealTimers();
  });

  it("writes the value and clears it after the configured delay", async () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(15));

    await copy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith("hunter2");

    await vi.advanceTimersByTimeAsync(15_000);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("never clears when the preference is 0", async () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(0));

    await copy();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(writeText).toHaveBeenCalledExactlyOnceWith("hunter2");
  });

  it("drops the clear once the user copies something in the page", async () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(15));

    await copy();
    document.dispatchEvent(new Event("copy"));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(writeText).toHaveBeenCalledExactlyOnceWith("hunter2");
  });

  it("does nothing for an empty value", async () => {
    localStorage.setItem(PREF_KEYS.clipboardClearSeconds, JSON.stringify(15));

    await copy("");
    await vi.advanceTimersByTimeAsync(15_000);

    expect(writeText).not.toHaveBeenCalled();
  });
});
