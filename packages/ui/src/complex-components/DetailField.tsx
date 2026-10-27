import { Button } from "@repo/ui/components/Button";
import { Kbd } from "@repo/ui/components/Kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { useExpandable } from "@repo/ui/hooks/use-expandable";
import { cn } from "@repo/ui/lib/utils";
import { ChevronDownIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const HIDDEN_VALUE = "••••••••••••";

type CopyButtonProps = {
  label: string;
  onCopy: () => void;
  /** Shown in the tooltip after the label. */
  shortcut?: string;
  className?: string;
};

function CopyButton({ label, onCopy, shortcut, className }: CopyButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground", className)}
            aria-label={`Copy ${label}`}
            onClick={onCopy}
          />
        }
      >
        <CopyIcon />
      </TooltipTrigger>
      <TooltipContent>
        Copy {label}
        {shortcut && <Kbd className="ml-1.5">{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

type DetailFieldProps = {
  /** The field name over the value; a row of a labelled section (websites) has none. */
  label?: string;
  value?: ReactNode;
  onCopy?: () => void;
  /** Names the copy button ("Copy …"); defaults to the label. */
  copyLabel?: string;
  /** The copy shortcut, shown next to the copy button. */
  shortcut?: string;
  hidden?: boolean;
  /** Re-hide a revealed value after this many ms. `0` keeps it revealed. */
  revealTimeoutMs?: number;
  /** Before the copy button (open link, TOTP countdown). */
  actions?: ReactNode;
  /** Wrap and keep line breaks instead of truncating to one line. */
  multiline?: boolean;
  valueClassName?: string;
  className?: string;
};

function ContentArea({
  type,
  className,
  ...props
}: ComponentProps<"button"> & ComponentProps<"div">) {
  const Element = type ? "button" : "div";
  return <Element type={type} className={cn("min-w-0 flex-1", className)} {...props} />;
}

function DetailField({
  label,
  value,
  onCopy,
  copyLabel,
  shortcut,
  hidden = false,
  revealTimeoutMs = 0,
  actions,
  multiline = false,
  valueClassName,
  className,
}: DetailFieldProps) {
  const [concealed, setConcealed] = useState(true);
  const showDots = hidden && concealed && Boolean(value);
  const name = copyLabel ?? label?.toLowerCase() ?? "value";

  useEffect(() => {
    if (concealed || revealTimeoutMs <= 0) return;
    const timer = setTimeout(() => setConcealed(true), revealTimeoutMs);
    return () => clearTimeout(timer);
  }, [concealed, revealTimeoutMs]);

  return (
    <div
      data-slot="detail-field"
      className={cn(
        "flex min-h-14.5 items-center gap-1.5 border-foreground/8 border-b py-2.5 dark:border-white/8",
        !label && "min-h-11.5",
        className,
      )}
    >
      {/* Touch screens have no hover to find the small copy button: the whole
          text area copies too. Keyboard users get the labelled button instead. */}
      <ContentArea
        {...(onCopy && value
          ? {
              type: "button" as const,
              tabIndex: -1,
              onClick: onCopy,
              className:
                "-my-2.5 -ml-2 cursor-pointer rounded-lg py-2.5 pl-2 text-left transition-colors active:bg-primary/8 dark:active:bg-foreground/5",
            }
          : {})}
      >
        {label && <p className="mb-0.5 font-medium text-muted-foreground/70 text-xs">{label}</p>}
        <div
          className={cn(
            "font-medium text-[0.97rem]",
            multiline || (hidden && !concealed)
              ? "wrap-break-word whitespace-pre-line"
              : "truncate",
            hidden && !concealed && "break-all",
            showDots && "tracking-[0.2em]",
            valueClassName,
          )}
        >
          {showDots ? HIDDEN_VALUE : value || "–"}
        </div>
      </ContentArea>
      {hidden && value && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={concealed ? `Show ${name}` : `Hide ${name}`}
          aria-pressed={!concealed}
          onClick={() => setConcealed(!concealed)}
        >
          {concealed ? <EyeIcon /> : <EyeOffIcon />}
        </Button>
      )}
      {actions}
      {onCopy && value && (
        <>
          {shortcut && (
            <Kbd
              aria-hidden
              className="ml-0.5 border border-foreground/10 bg-transparent max-sm:hidden"
            >
              {shortcut}
            </Kbd>
          )}
          <CopyButton label={name} onCopy={onCopy} shortcut={shortcut} />
        </>
      )}
    </div>
  );
}

type DetailFieldGroupProps = {
  children: ReactNode;
  /** `card`: a boxed, padded group (a version diff cell) instead of flush rows. */
  variant?: "flush" | "card";
  className?: string;
};

function DetailFieldGroup({ children, variant = "flush", className }: DetailFieldGroupProps) {
  return (
    <div
      data-slot="detail-field-group"
      className={cn(
        variant === "flush"
          ? "border-foreground/8 border-t dark:border-white/8"
          : "rounded-2xl border border-foreground/10 px-4 dark:border-white/10 [&>[data-slot=detail-field]]:last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { CopyButton, DetailField, DetailFieldGroup };

type DetailCodeBlockProps = {
  children: string;
  onCopy?: () => void;
  copyLabel?: string;
};

/**
 * Preformatted text (a note). A long one is capped at `max-h-80`: it scrolls inside,
 * fades out at the bottom until scrolled to the end, and a footer shows it in full.
 * Remount it (`key`) to collapse it again for another record.
 */
function DetailCodeBlock({ children, onCopy, copyLabel = "text" }: DetailCodeBlockProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }, []);

  const { expanded, overflows, toggle } = useExpandable(scrollRef, {
    content: children,
    onMeasure: measure,
  });
  const clipped = overflows && !expanded;

  return (
    <div className="relative overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.025] dark:border-white/10 dark:bg-white/[0.03]">
      <div
        ref={scrollRef}
        onScroll={clipped ? measure : undefined}
        // A scrolling region must be reachable by keyboard.
        {...(clipped && { role: "region", "aria-label": copyLabel, tabIndex: 0 })}
        className={cn(
          "py-3 pr-12 pl-3.5 outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:ring-inset",
          !expanded && "max-h-80 overflow-y-auto overscroll-contain",
          clipped &&
            !atEnd &&
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-4rem),transparent)]",
        )}
      >
        <pre className="wrap-break-word whitespace-pre-wrap font-mono text-[0.84rem] leading-[1.65]">
          {children}
        </pre>
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggle}
          className="flex w-full items-center justify-center gap-1 border-foreground/8 border-t py-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-foreground/[0.03] hover:text-foreground focus-visible:bg-foreground/[0.04] focus-visible:text-foreground dark:border-white/8"
        >
          {expanded ? "Show less" : `Show full ${copyLabel}`}
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
      )}
      {onCopy && (
        <CopyButton
          label={copyLabel}
          onCopy={onCopy}
          className="absolute top-1.5 right-1.5 border-foreground/10 bg-background dark:border-white/10"
        />
      )}
    </div>
  );
}

export { DetailCodeBlock };
