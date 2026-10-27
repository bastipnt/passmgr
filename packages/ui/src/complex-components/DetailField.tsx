import { Button } from "@repo/ui/components/Button";
import { Kbd } from "@repo/ui/components/Kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { useExpandable } from "@repo/ui/hooks/use-expandable";
import { blurredTextClassName } from "@repo/ui/lib/field-styles";
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
  /** After the label (a "Hidden" mark, the card network). */
  labelSuffix?: ReactNode;
  value?: ReactNode;
  /** Shown while `hidden` in place of plain dots ("4111 •••• •••• 1111"). */
  maskedValue?: string;
  /** Muted text after the value ("35 years"); left out while `hidden` hides it. */
  hint?: ReactNode;
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
  labelSuffix,
  value,
  maskedValue,
  hint,
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
        {label && (
          <p className="mb-0.5 flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground/70 text-xs">
            <span className="truncate">{label}</span>
            {labelSuffix}
          </p>
        )}
        <div
          className={cn(
            "font-medium text-[0.97rem]",
            multiline || (hidden && !concealed)
              ? "wrap-break-word whitespace-pre-line"
              : "truncate",
            hidden && !concealed && "break-all",
            showDots && !maskedValue && "tracking-[0.2em]",
            valueClassName,
          )}
        >
          {showDots ? (maskedValue ?? HIDDEN_VALUE) : value || "–"}
          {hint && !showDots && (
            <span className="ml-1.5 font-normal font-sans text-muted-foreground/70 text-xs tracking-normal">
              {hint}
            </span>
          )}
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

type DetailFieldRowProps = {
  children: ReactNode;
  /** Keep the fields side by side on phones too (the form's `phoneShare`). */
  keepOnPhone?: boolean;
};

/** Fields that share a row in the form, split by a hairline; stacked on phones unless kept. */
function DetailFieldRow({ children, keepOnPhone = false }: DetailFieldRowProps) {
  return (
    <div
      data-slot="detail-field-row"
      className={cn(
        "grid auto-cols-fr divide-foreground/8 border-foreground/8 border-b dark:divide-white/8 dark:border-white/8 [&>[data-slot=detail-field]]:border-b-0",
        keepOnPhone
          ? "grid-flow-col divide-x [&>*+*]:pl-3 [&>:not(:last-child)]:pr-2"
          : "max-sm:divide-y sm:grid-flow-col sm:divide-x sm:[&>*+*]:pl-4 sm:[&>:not(:last-child)]:pr-3",
      )}
    >
      {children}
    </div>
  );
}

const TONE_CLASSES = {
  neutral: "bg-success/12 text-emerald-700 dark:text-success",
  warning: "bg-warning/20 text-amber-700 dark:text-warning",
  danger: "bg-destructive/12 text-destructive",
} as const;

/** A small status chip among a field's actions (a card's time left). */
function DetailStatus({
  tone,
  children,
}: {
  tone: keyof typeof TONE_CLASSES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-full px-2 font-semibold text-[0.6875rem]",
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A tag after a field's label (the card network). */
function DetailBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1 py-px font-bold text-[0.625rem] text-primary-text uppercase italic tracking-wide">
      {children}
    </span>
  );
}

export { CopyButton, DetailBadge, DetailField, DetailFieldGroup, DetailFieldRow, DetailStatus };

type DetailCodeBlockProps = {
  children: string;
  onCopy?: () => void;
  copyLabel?: string;
  /** The field name at the top of the block, with `labelSuffix` after it. */
  label?: string;
  labelSuffix?: ReactNode;
  /** The footer's status text ("58 words · 498 characters"). */
  summary?: ReactNode;
  /** Can be hidden: blurred, with a "Show …" button over it. */
  concealable?: boolean;
  defaultConcealed?: boolean;
  /** Re-hide a shown block after this many ms. `0` keeps it shown. */
  revealTimeoutMs?: number;
  /** More buttons under the copy button (download). */
  actions?: ReactNode;
};

/** The block's text with its shape kept but no character of it: what a hidden block blurs. */
function shapeOf(text: string): string {
  return text.replace(/[^\s-]/g, "x");
}

/**
 * Preformatted text (a note). A long one is capped at `max-h-80`: it scrolls inside,
 * fades out at the bottom until scrolled to the end, and a footer shows it in full.
 * Remount it (`key`) to collapse it again for another record.
 */
function DetailCodeBlock({
  children,
  onCopy,
  copyLabel = "text",
  label,
  labelSuffix,
  summary,
  concealable = false,
  defaultConcealed = concealable,
  revealTimeoutMs = 0,
  actions,
}: DetailCodeBlockProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [concealed, setConcealed] = useState(concealable && defaultConcealed);

  useEffect(() => {
    if (concealed || !concealable || revealTimeoutMs <= 0) return;
    const timer = setTimeout(() => setConcealed(true), revealTimeoutMs);
    return () => clearTimeout(timer);
  }, [concealed, concealable, revealTimeoutMs]);

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
  const expandToggle = (overflows || expanded) && (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={toggle}
      className={cn(
        "flex items-center justify-center gap-1 py-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-foreground/[0.03] hover:text-foreground focus-visible:bg-foreground/[0.04] focus-visible:text-foreground",
        summary ? "ml-auto px-3.5" : "w-full",
      )}
    >
      {expanded ? "Show less" : `Show full ${copyLabel}`}
      <ChevronDownIcon className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.025] dark:border-white/10 dark:bg-white/[0.03]">
      {label && (
        <p className="flex items-center gap-1.5 px-3.5 pt-2.5 pr-12 font-medium text-muted-foreground/70 text-xs">
          {label}
          {labelSuffix}
        </p>
      )}
      <div
        ref={scrollRef}
        onScroll={clipped ? measure : undefined}
        // A scrolling region must be reachable by keyboard.
        {...(clipped && { role: "region", "aria-label": copyLabel, tabIndex: 0 })}
        className={cn(
          "pr-12 pl-3.5 outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:ring-inset",
          label ? "pt-1 pb-3" : "py-3",
          !expanded && "max-h-80 overflow-y-auto overscroll-contain",
          clipped &&
            !atEnd &&
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-4rem),transparent)]",
        )}
      >
        {concealed ? (
          <pre
            aria-hidden
            className={cn(
              "wrap-break-word whitespace-pre-wrap font-mono text-[0.84rem] leading-[1.65]",
              blurredTextClassName,
            )}
          >
            {shapeOf(children)}
          </pre>
        ) : (
          <pre className="wrap-break-word whitespace-pre-wrap font-mono text-[0.84rem] leading-[1.65]">
            {children}
          </pre>
        )}
      </div>
      {concealed && (
        <Button
          variant="outline"
          size="sm"
          className="absolute inset-0 m-auto w-fit bg-background"
          onClick={() => setConcealed(false)}
        >
          <EyeIcon />
          Show {copyLabel}
        </Button>
      )}
      {(summary || expandToggle) && (
        <div className="flex items-center border-foreground/8 border-t dark:border-white/8">
          {summary && (
            <span className="min-w-0 truncate px-3.5 py-2 text-muted-foreground/80 text-xs">
              {summary}
            </span>
          )}
          {expandToggle}
        </div>
      )}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 [&>button]:border-foreground/10 [&>button]:bg-background dark:[&>button]:border-white/10">
        {onCopy && <CopyButton label={copyLabel} onCopy={onCopy} />}
        {concealable && !concealed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Hide ${copyLabel}`}
            onClick={() => setConcealed(true)}
          >
            <EyeOffIcon />
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

export { DetailCodeBlock };
