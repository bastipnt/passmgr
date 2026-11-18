import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@repo/ui/lib/utils";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_LABELS, ACCENT_PRESETS, type AccentPreset } from "@repo/ui-shared";

/** The accent presets as swatch tiles (a radio group), each named under its swatch. */
export function AccentPicker({ className }: { className?: string }) {
  const { accent, setAccent } = useTheme();

  return (
    <RadioGroup
      aria-label="Accent"
      value={accent}
      onValueChange={(value) => setAccent(value as AccentPreset)}
      className={cn("grid grid-cols-6 gap-2.5 max-sm:grid-cols-3", className)}
    >
      {ACCENT_PRESETS.map((preset) => (
        <Radio.Root
          key={preset}
          value={preset}
          aria-label={ACCENT_LABELS[preset]}
          data-accent={preset}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border border-border bg-card px-2 py-3 font-medium text-[13px] text-foreground leading-4.5 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-4 focus-visible:ring-ring/25 data-checked:border-2 data-checked:border-primary data-checked:bg-primary/5"
        >
          <span aria-hidden="true" className="size-8 rounded-full bg-primary" />
          {ACCENT_LABELS[preset]}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
