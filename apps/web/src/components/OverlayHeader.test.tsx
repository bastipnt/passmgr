import { ShortcutLayer, ShortcutProvider } from "@repo/client";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayHeader } from "./OverlayHeader";

afterEach(cleanup);

function pressEscape(target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => void target.dispatchEvent(event));
  return event;
}

function renderHeader(onClose: () => void, extra?: ReactNode) {
  return render(
    <ShortcutProvider>
      <OverlayHeader title="Settings" closeLabel="Close settings" onClose={onClose} />
      {extra}
    </ShortcutProvider>,
  );
}

describe("OverlayHeader", () => {
  it("closes on Esc and leaves the default to the browser", () => {
    const onClose = vi.fn();
    renderHeader(onClose);

    expect(pressEscape().defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Esc to a focused field or dialog", () => {
    const onClose = vi.fn();
    const view = renderHeader(
      onClose,
      <>
        <input aria-label="Search" />
        <dialog open>
          <button type="button">Inside</button>
        </dialog>
      </>,
    );

    pressEscape(view.getByLabelText("Search"));
    pressEscape(view.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores an Esc something else already handled", () => {
    const onClose = vi.fn();
    renderHeader(onClose);
    const handled = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener("keydown", handled, { capture: true });

    pressEscape();
    document.removeEventListener("keydown", handled, { capture: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is muted while a shortcut layer above it is active", () => {
    const onClose = vi.fn();
    renderHeader(onClose, <ShortcutLayer>{null}</ShortcutLayer>);

    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});
