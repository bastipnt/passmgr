import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Badge } from "@repo/ui/components/Badge";
import { BrandMark } from "@repo/ui/components/BrandMark";
import { cn } from "@repo/ui/lib/utils";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_LABELS, ACCENT_PRESETS, type AccentPreset, DEFAULT_ACCENT } from "@repo/ui-shared";
import { Check } from "lucide-react";

function AccentPreview({ accent, mode }: { accent: AccentPreset; mode: "light" | "dark" }) {
  return (
    <span
      data-accent={accent}
      className={cn(mode, "flex flex-col gap-1.5 bg-background p-2 text-foreground")}
    >
      <span className="flex items-center gap-1.5">
        <BrandMark className="size-4" />
        <span className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
      </span>
      <span className="flex h-3 items-center rounded-sm bg-primary/15 px-1">
        <span className="h-1 w-6 rounded-full bg-primary-text" />
      </span>
      <span className="h-3 w-10 rounded-full bg-primary" />
    </span>
  );
}

/** Accent preset cards (radio group), each previewing light and dark. */
export function AccentPicker({ className }: { className?: string }) {
  const { accent, setAccent } = useTheme();

  return (
    <RadioGroup
      aria-label="Accent"
      value={accent}
      onValueChange={(value) => setAccent(value as AccentPreset)}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}
    >
      {ACCENT_PRESETS.map((preset) => (
        <Radio.Root
          key={preset}
          value={preset}
          aria-label={ACCENT_LABELS[preset]}
          className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-1.5 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-4 focus-visible:ring-ring/25 data-checked:border-primary data-checked:ring-2 data-checked:ring-primary/25"
        >
          <span className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
            <AccentPreview accent={preset} mode="light" />
            <AccentPreview accent={preset} mode="dark" />
          </span>
          <span className="flex items-center gap-1.5 px-1 pb-0.5">
            <span className="font-medium text-sm">{ACCENT_LABELS[preset]}</span>
            {preset === DEFAULT_ACCENT && <Badge variant="outline">Default</Badge>}
            <span className="ml-auto grid size-4 place-items-center rounded-full border border-input">
              <Radio.Indicator className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </Radio.Indicator>
            </span>
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
