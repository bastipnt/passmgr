import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClipboardAccess,
  copyToClipboard,
  flushClipboardClear,
} from "../src/hooks/use-clipboard-clear";

function fakeClipboard({ readable = true } = {}) {
  let text = "";
  let onChange: (() => void) | undefined;
  const clipboard: ClipboardAccess = {
    write: vi.fn(async (next: string) => {
      text = next;
    }),
    ...(readable ? { read: async () => text } : {}),
    watch: (listener) => {
      onChange = listener;
      return () => {
        onChange = undefined;
      };
    },
  };
  return {
    clipboard,
    get text() {
      return text;
    },
    /** The user copies something in another app (or in the page). */
    copyElsewhere(next: string) {
      text = next;
      onChange?.();
    },
  };
}

describe("copyToClipboard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await flushClipboardClear();
    vi.useRealTimers();
  });

  it("writes the value and clears it after the delay", async () => {
    const board = fakeClipboard();
    expect(await copyToClipboard(board.clipboard, "hunter2", 15)).toBe(true);
    expect(board.text).toBe("hunter2");

    await vi.advanceTimersByTimeAsync(14_999);
    expect(board.text).toBe("hunter2");
    await vi.advanceTimersByTimeAsync(1);
    expect(board.text).toBe("");
  });

  it("never clears with a delay of 0", async () => {
    const board = fakeClipboard();
    await copyToClipboard(board.clipboard, "hunter2", 0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(board.text).toBe("hunter2");
  });

  it("copies nothing for an empty value", async () => {
    const board = fakeClipboard();
    expect(await copyToClipboard(board.clipboard, "", 15)).toBe(false);
    expect(board.clipboard.write).not.toHaveBeenCalled();
  });

  it("reports a failed write and schedules no clear", async () => {
    const write = vi.fn().mockRejectedValue(new Error("not focused"));
    expect(await copyToClipboard({ write }, "hunter2", 15)).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(write).toHaveBeenCalledOnce();
  });

  it("keeps what the clipboard holds now when it can read it", async () => {
    const board = fakeClipboard();
    await copyToClipboard(board.clipboard, "hunter2", 15);
    board.copyElsewhere("a newer copy");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(board.text).toBe("a newer copy");
  });

  it("drops the clear when the user copies something else and the clipboard is unreadable", async () => {
    const board = fakeClipboard({ readable: false });
    await copyToClipboard(board.clipboard, "hunter2", 15);
    board.copyElsewhere("a newer copy");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(board.text).toBe("a newer copy");
  });

  it("clears an unreadable clipboard nothing else was copied to", async () => {
    const board = fakeClipboard({ readable: false });
    await copyToClipboard(board.clipboard, "hunter2", 15);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(board.text).toBe("");
  });

  it("restarts the delay on a fresh copy", async () => {
    const board = fakeClipboard();
    await copyToClipboard(board.clipboard, "first", 15);
    await vi.advanceTimersByTimeAsync(10_000);
    await copyToClipboard(board.clipboard, "second", 15);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(board.text).toBe("second");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(board.text).toBe("");
  });
});

describe("flushClipboardClear", () => {
  it("clears a pending copy at once and only once", async () => {
    const board = fakeClipboard();
    await copyToClipboard(board.clipboard, "hunter2", 30);
    await flushClipboardClear();
    expect(board.text).toBe("");
    expect(board.clipboard.write).toHaveBeenCalledTimes(2);

    await flushClipboardClear();
    expect(board.clipboard.write).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a pending clear", async () => {
    const board = fakeClipboard();
    await copyToClipboard(board.clipboard, "hunter2", 0);
    await flushClipboardClear();
    expect(board.text).toBe("hunter2");
  });

  it("gives up on a clipboard that never answers", async () => {
    vi.useFakeTimers();
    const write = vi.fn((text: string) => (text ? undefined : new Promise<void>(() => {})));
    await copyToClipboard({ write }, "hunter2", 30);
    const flushed = flushClipboardClear(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(flushed).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
