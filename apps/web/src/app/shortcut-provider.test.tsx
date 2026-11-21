import { ShortcutLayer, ShortcutProvider, useShortcut, useShortcutContext } from "@repo/client";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function press(key: string) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, bubbles: true }),
    );
  });
}

function Shortcut({ keyName, handler }: { keyName: string; handler: () => void }) {
  useShortcut(keyName, handler, { description: keyName });
  return null;
}

function Listed() {
  const { shortcuts } = useShortcutContext();
  return <p data-testid="listed">{shortcuts.map((s) => s.key).join(",")}</p>;
}

describe("ShortcutProvider", () => {
  it("binds a registered shortcut, lists it, and unbinds it on unregister", () => {
    const handler = vi.fn();
    function Harness() {
      const [on, setOn] = useState(true);
      return (
        <ShortcutProvider>
          {on && <Shortcut keyName="a" handler={handler} />}
          <Listed />
          <button type="button" onClick={() => setOn(false)}>
            off
          </button>
        </ShortcutProvider>
      );
    }
    const view = render(<Harness />);

    press("a");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("listed").textContent).toBe("a");

    act(() => view.getByText("off").click());
    press("a");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("listed").textContent).toBe("");
  });

  it("mutes the base layer while an overlay is active and restores it after", () => {
    const base = vi.fn();
    const overlay = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <ShortcutProvider>
          <Shortcut keyName="b" handler={base} />
          <ShortcutLayer active={open}>
            {open && <Shortcut keyName="c" handler={overlay} />}
          </ShortcutLayer>
          <Listed />
        </ShortcutProvider>
      );
    }
    const view = render(<Harness open />);

    press("b");
    press("c");
    expect(base).not.toHaveBeenCalled();
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("listed").textContent).toContain("b");

    view.rerender(<Harness open={false} />);
    press("b");
    press("c");
    expect(base).toHaveBeenCalledTimes(1);
    expect(overlay).toHaveBeenCalledTimes(1);
  });
});
