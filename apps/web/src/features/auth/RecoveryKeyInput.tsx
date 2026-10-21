import {
  RECOVERY_KEY_GROUP_LENGTH as GROUP_LENGTH,
  RECOVERY_KEY_GROUPS as GROUPS,
} from "@repo/client";
import { cn } from "@repo/ui/lib/utils";
import { type KeyboardEvent, useRef, useState } from "react";
import { RECOVERY_KEY_GROUP_COLORS } from "./recovery-key-colors";

/** The last chunk keeps any excess, so a too-long key still reads as one. */
function split(value: string): string[] {
  return Array.from({ length: GROUPS }, (_, i) =>
    value.slice(i * GROUP_LENGTH, i === GROUPS - 1 ? undefined : (i + 1) * GROUP_LENGTH),
  );
}

type RecoveryKeyInputProps = {
  /** The key without whitespace. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  labelledBy: string;
  invalid?: boolean;
  ref?: (input: HTMLInputElement | null) => void;
};

/**
 * The recovery key in the four groups it is shown in (`RecoveryKeyDialog`).
 * A paste or overflow into any group spreads over the following ones.
 */
export default function RecoveryKeyInput({
  value,
  onChange,
  onBlur,
  labelledBy,
  invalid,
  ref,
}: RecoveryKeyInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // Typed groups may be shorter than a chunk: the value alone can't say where they end.
  const [chunks, setChunks] = useState(() => split(value));
  if (chunks.join("") !== value) setChunks(split(value));

  const change = (i: number, raw: string) => {
    const text = raw.replace(/\s+/g, "");
    let next: string[];
    let focus = i;
    if (text.length <= GROUP_LENGTH || i === GROUPS - 1) {
      next = chunks.map((chunk, j) => (j === i ? text : chunk));
      if (text.length === GROUP_LENGTH && i < GROUPS - 1) focus = i + 1;
    } else {
      const before = chunks.slice(0, i).join("");
      next = split(before + text + chunks.slice(i + 1).join(""));
      focus = Math.min(Math.floor((before.length + text.length) / GROUP_LENGTH), GROUPS - 1);
    }
    setChunks(next);
    onChange(next.join(""));
    if (focus !== i) inputs.current[focus]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && i > 0 && e.currentTarget.value === "") {
      e.preventDefault();
      inputs.current[i - 1]?.focus();
    }
  };

  return (
    <fieldset
      aria-labelledby={labelledBy}
      className={cn(
        "grid min-w-0 grid-cols-2 gap-1.5 rounded-xl border border-foreground/12 bg-white/60 p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15 dark:border-white/14 dark:bg-white/5 dark:focus-within:ring-ring/20",
        invalid &&
          "border-destructive/50 ring-4 ring-destructive/10 focus-within:border-destructive/50 focus-within:ring-destructive/10 dark:border-destructive/45",
        "has-disabled:opacity-50",
      )}
    >
      {chunks.map((chunk, i) => (
        <input
          key={i}
          ref={(input) => {
            inputs.current[i] = input;
            if (i === 0) ref?.(input);
          }}
          name={`recoveryKey-${i + 1}`}
          aria-label={`Group ${i + 1} of ${GROUPS}`}
          aria-invalid={invalid}
          value={chunk}
          onChange={(e) => change(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onBlur={onBlur}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "h-10 min-w-0 rounded-lg bg-foreground/[0.04] px-3 font-medium font-mono text-sm outline-none focus:bg-foreground/[0.07] dark:bg-black/25",
            RECOVERY_KEY_GROUP_COLORS[i],
          )}
        />
      ))}
    </fieldset>
  );
}
