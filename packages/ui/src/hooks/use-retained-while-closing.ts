import { useState } from "react";

/**
 * A dialog's open state and what it shows: `show` sets the value and opens it. Closing
 * keeps the value, so the content doesn't change or empty while the dialog animates out.
 */
export function useRetainedWhileClosing<T>() {
  const [value, setValue] = useState<T>();
  const [open, setOpen] = useState(false);
  const show = (next: T) => {
    setValue(next);
    setOpen(true);
  };
  return { value, open, setOpen, show };
}

/**
 * A key that changes each time `open` turns true: content keyed on it starts fresh per
 * opening, yet isn't unmounted on close, so it stays while the dialog animates out.
 */
export function useOpeningKey(open: boolean): number {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  return opening;
}
