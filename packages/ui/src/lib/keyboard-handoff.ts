/**
 * iOS raises the on-screen keyboard only for a `focus()` that runs inside a
 * tap. To bring it up on a field that only mounts after a page change, focus a
 * hidden stand-in input in the tap (`holdKeyboard`), then move focus to the
 * field once it exists (`handOffKeyboard`); moving focus between inputs keeps
 * the keyboard up. `releaseKeyboard` drops it when the field won't come.
 */
const HOLD_MS = 1500;

let standIn: HTMLInputElement | undefined;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

export function holdKeyboard(): void {
  if (!standIn) {
    standIn = document.createElement("input");
    standIn.type = "text";
    standIn.tabIndex = -1;
    standIn.setAttribute("aria-hidden", "true");
    // 16px, or iOS zooms the page on focus.
    standIn.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none";
  }
  document.body.append(standIn);
  standIn.focus({ preventScroll: true });
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(releaseKeyboard, HOLD_MS);
}

/** Moves a held keyboard to `field`; false when none is held. */
export function handOffKeyboard(field: HTMLElement | null): boolean {
  if (!standIn?.isConnected || !field || document.activeElement !== standIn) return false;
  field.focus({ preventScroll: true });
  releaseKeyboard();
  return true;
}

export function releaseKeyboard(): void {
  clearTimeout(releaseTimer);
  if (!standIn?.isConnected) return;
  standIn.blur();
  standIn.value = "";
  standIn.remove();
}
