import { useOpeningKey, useRetainedWhileClosing } from "@repo/ui/hooks/use-retained-while-closing";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useRetainedWhileClosing", () => {
  it("starts closed, with no value", () => {
    const { result } = renderHook(() => useRetainedWhileClosing<string>());
    expect(result.current.open).toBe(false);
    expect(result.current.value).toBeUndefined();
  });

  it("opens on show and keeps the last value while closed", () => {
    const { result } = renderHook(() => useRetainedWhileClosing<string>());
    act(() => result.current.show("a"));
    expect(result.current).toMatchObject({ open: true, value: "a" });

    act(() => result.current.setOpen(false));
    expect(result.current).toMatchObject({ open: false, value: "a" });
  });

  it("updates the value while open, and on the next opening", () => {
    const { result } = renderHook(() => useRetainedWhileClosing<string>());
    act(() => result.current.show("a"));
    act(() => result.current.show("b"));
    expect(result.current).toMatchObject({ open: true, value: "b" });

    act(() => result.current.setOpen(false));
    act(() => result.current.show("c"));
    expect(result.current).toMatchObject({ open: true, value: "c" });
  });
});

describe("useOpeningKey", () => {
  it("changes on each opening and stays put while open and while closed", () => {
    const { result, rerender } = renderHook(({ open }) => useOpeningKey(open), {
      initialProps: { open: false },
    });
    const closed = result.current;

    rerender({ open: true });
    const first = result.current;
    expect(first).not.toBe(closed);
    rerender({ open: true });
    expect(result.current).toBe(first);

    rerender({ open: false });
    expect(result.current).toBe(first);

    rerender({ open: true });
    expect(result.current).not.toBe(first);
  });

  it("counts a dialog that mounts open as opened", () => {
    const { result, rerender } = renderHook(({ open }) => useOpeningKey(open), {
      initialProps: { open: true },
    });
    const first = result.current;
    rerender({ open: false });
    rerender({ open: true });
    expect(result.current).not.toBe(first);
  });
});
