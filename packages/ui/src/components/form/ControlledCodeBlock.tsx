import {
  FieldBoxError,
  FieldBoxHiddenMarker,
  FieldBoxLabel,
  FieldBoxRevealButton,
} from "@repo/ui/components/FieldBox";
import { useExpandable } from "@repo/ui/hooks/use-expandable";
import {
  blurredTextClassName,
  fieldBoxFrameClassName,
  maskedTextClassName,
} from "@repo/ui/lib/field-styles";
import { cn, mergeRefs } from "@repo/ui/lib/utils";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useMemo, useRef, useState } from "react";
import {
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
  useController,
} from "react-hook-form";

export type ControlledCodeBlockProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  label: string;
  /** The label for assistive tech only (a section heading names the block). */
  hideLabel?: boolean;
  /** Masked until focused or shown with the eye button, marked "Hidden". */
  secret?: boolean;
  /** How a `secret` is masked: dots, or blurred (keeps the text's shape). */
  mask?: "dots" | "blur";
  /** `tall`: the record's body (a secure note). */
  size?: "default" | "tall";
  /** The bottom bar's status text; `masked` while a `secret` is not shown. */
  summary: (value: string, masked: boolean) => ReactNode;
  /** On the wrapper (grid placement), not the textarea. */
  className?: string;
} & UseControllerProps<TFieldValues, TName> &
  Omit<
    ComponentProps<"textarea">,
    "name" | "defaultValue" | "className" | "id" | "aria-invalid" | "rows" | "value" | "onChange"
  >;

/**
 * A monospaced textarea shaped like the record display's code block: a tinted box with
 * a bottom bar (status text, Expand). Collapsed, a long value scrolls inside a capped
 * height; Expand lets it grow with the content.
 */
export function ControlledCodeBlock<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  rules,
  shouldUnregister,
  defaultValue,
  disabled,
  label,
  hideLabel = false,
  secret = false,
  mask = "dots",
  size = "default",
  summary,
  className,
  onBlur,
  ...props
}: ControlledCodeBlockProps<TFieldValues>) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [revealed, setRevealed] = useState(false);
  const { field, fieldState } = useController({
    name,
    control,
    rules,
    shouldUnregister,
    defaultValue,
    disabled,
  });
  const value: string = field.value ?? "";
  const masked = secret && !revealed;
  const { expanded, overflows, toggle } = useExpandable(textareaRef, { content: value });
  const status = useMemo(() => summary(value, masked), [summary, value, masked]);

  return (
    <div data-slot="field-box-field" className={cn("flex flex-col gap-1.5", className)}>
      <div
        data-slot="code-block-field"
        data-invalid={fieldState.invalid}
        className={cn(fieldBoxFrameClassName, "overflow-hidden bg-code")}
      >
        {(!hideLabel || secret) && (
          <div className="flex min-h-11 items-center gap-1.5 pt-1 pr-2 pl-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <label htmlFor={id} className={cn("min-w-0", hideLabel && "sr-only")}>
                <FieldBoxLabel className="mb-0 block">{label}</FieldBoxLabel>
              </label>
              {secret && <FieldBoxHiddenMarker />}
            </div>
            {secret && (
              <FieldBoxRevealButton
                name={label.toLowerCase()}
                revealed={revealed}
                onRevealedChange={setRevealed}
                disabled={field.disabled}
              />
            )}
          </div>
        )}
        <textarea
          {...props}
          {...field}
          ref={mergeRefs(field.ref, textareaRef)}
          value={value}
          onBlur={(event) => {
            field.onBlur();
            onBlur?.(event);
          }}
          id={id}
          data-slot="field-box-control"
          aria-label={hideLabel && !secret ? label : undefined}
          aria-invalid={fieldState.invalid}
          className={cn(
            "field-sizing-content wrap-anywhere block w-full resize-none overflow-y-auto overscroll-contain bg-transparent px-3.5 font-mono text-[0.84375rem] leading-[1.65] outline-none placeholder:font-sans placeholder:text-muted-foreground/70 disabled:cursor-not-allowed",
            hideLabel && !secret ? "py-3" : "pt-0.5 pb-3",
            size === "tall" ? "min-h-60 sm:min-h-105" : "min-h-24",
            !expanded && (size === "tall" ? "max-h-[min(40rem,70vh)]" : "max-h-80"),
            masked && (mask === "blur" ? blurredTextClassName : maskedTextClassName),
          )}
        />
        <div className="flex min-h-9 items-center justify-between gap-3 border-foreground/8 border-t py-1 pr-1.5 pl-3.5 text-muted-foreground text-xs dark:border-white/8">
          <span className="min-w-0 truncate tabular-nums">{status}</span>
          {(overflows || expanded) && (
            <button
              type="button"
              aria-controls={id}
              aria-expanded={expanded}
              onClick={toggle}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 font-semibold text-primary-text outline-none transition-colors hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5"
            >
              {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </div>
      {fieldState.invalid && <FieldBoxError error={fieldState.error} />}
    </div>
  );
}
