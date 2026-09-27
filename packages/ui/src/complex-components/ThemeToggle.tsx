import { cn } from "@repo/ui/lib/utils";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** Segmented light / system / dark switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-0.5 rounded-full border border-foreground/12 bg-white/60 p-1 dark:border-white/12 dark:bg-white/5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25 aria-checked:bg-white aria-checked:text-foreground aria-checked:shadow-xs dark:aria-checked:bg-white/12 dark:aria-checked:shadow-none [&_svg]:size-4"
        >
          <Icon aria-hidden />
        </button>
      ))}
    </div>
  );
}
