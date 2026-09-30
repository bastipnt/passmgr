import { type ComponentProps, useEffect, useRef } from "react";

type FormLockProps = Omit<ComponentProps<"fieldset">, "disabled" | "className"> & {
  locked: boolean;
};

/**
 * Disables every native control inside while `locked` — e.g. while a form submits.
 * A `<fieldset disabled>` without a box of its own (`display: contents`), so it
 * doesn't affect layout and the controls' `disabled:` styles apply as usual.
 *
 * Disabling drops focus to `<body>`; on unlock (e.g. after a failed submit) focus
 * returns to the control that had it, so the user can correct and resubmit.
 */
export function FormLock({ locked, ...props }: FormLockProps) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fieldset = fieldsetRef.current;
    if (!fieldset) return;
    const track = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) lastFocused.current = e.target;
    };
    fieldset.addEventListener("focusin", track);
    return () => fieldset.removeEventListener("focusin", track);
  }, []);

  useEffect(() => {
    if (locked) return;
    const el = lastFocused.current;
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (el?.isConnected && focusLost) el.focus();
  }, [locked]);

  return <fieldset ref={fieldsetRef} disabled={locked} className="contents" {...props} />;
}
