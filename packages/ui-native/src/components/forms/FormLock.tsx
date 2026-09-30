import { useEffect } from "react";
import { Keyboard, View, type ViewProps } from "react-native";

import { cn } from "../../lib/utils";

type FormLockProps = ViewProps & {
  locked: boolean;
  className?: string;
};

/**
 * Locks every input inside while `locked` — e.g. while a form submits. RN has no
 * `<fieldset disabled>`, so touches are blocked instead and the keyboard is
 * dismissed (a focused `TextInput` would otherwise keep accepting input).
 */
export function FormLock({ locked, className, style, ...props }: FormLockProps) {
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);

  return (
    <View
      aria-disabled={locked}
      className={cn(locked && "opacity-60", className)}
      style={[{ pointerEvents: locked ? "none" : "auto" }, style]}
      {...props}
    />
  );
}
