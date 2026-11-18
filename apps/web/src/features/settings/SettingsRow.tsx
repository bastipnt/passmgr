import { SelectTrigger } from "@repo/ui/components/Select";
import { Switch } from "@repo/ui/components/Switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ToggleGroup";
import { type StatusTone, toneTextClassName } from "@repo/ui/lib/tone";
import { cn } from "@repo/ui/lib/utils";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import { type ComponentProps, createContext, type ReactNode, use, useId } from "react";
import { Link as WouterLink } from "wouter";
import { useGroupVariant } from "./SettingsGroup";

/** What names and describes a row's control: the label; the status and the hint. */
type RowLabel = { labelId: string; describedBy: string | undefined };

const RowLabelContext = createContext<RowLabel | null>(null);

type RowStatus = { label: string; tone: StatusTone };

type RowTextProps = {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown after the label ("Two-factor authentication · Off"): describes the control, doesn't name it. */
  status?: RowStatus;
};

type SettingsRowProps = RowTextProps & { className?: string } & (
    | {
        /** Right-hand control: a button, `SettingsSwitch`, `SettingsSegmented`, a select. */
        control?: ReactNode;
        href?: never;
        onClick?: never;
        value?: never;
      }
    | {
        /** Drill-down: the whole row links there, with `value` and a chevron. */
        href: string;
        onClick?: never;
        value?: ReactNode;
        control?: never;
      }
    | {
        /** The whole row is a button (opens a dialog), with `value`. */
        onClick: () => void;
        href?: never;
        value?: ReactNode;
        control?: never;
      }
  );

const rowClassName =
  "flex min-h-15 w-full items-center gap-4 px-5 py-3 text-left max-sm:min-h-14 max-sm:gap-3 max-sm:px-4.5 max-sm:py-2.5";

const pressableRowClassName =
  "outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

function RowText({
  label,
  hint,
  status,
  labelId,
  statusId,
  hintId,
}: RowTextProps & { labelId: string; statusId: string; hintId: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 max-sm:gap-0">
      <span className="font-medium text-sm leading-5 max-sm:font-normal max-sm:text-base max-sm:leading-6">
        <span id={labelId}>{label}</span>
        {status && (
          <>
            {" "}
            <span id={statusId} className={cn("font-medium", toneTextClassName[status.tone])}>
              · {status.label}
            </span>
          </>
        )}
      </span>
      {hint != null && (
        <span id={hintId} className="text-[13px] text-muted-foreground leading-4.5">
          {hint}
        </span>
      )}
    </span>
  );
}

/** Label and one-line hint on the left, a control (or a drill-down) on the right. */
export function SettingsRow({
  label,
  hint,
  status,
  control,
  href,
  onClick,
  value,
  className,
}: SettingsRowProps) {
  const danger = useGroupVariant() === "danger";
  const labelId = useId();
  const statusId = useId();
  const hintId = useId();
  const valueId = useId();
  const describedBy = (ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;
  const controlLabel: RowLabel = {
    labelId,
    describedBy: describedBy([status != null && statusId, hint != null && hintId]),
  };
  // A pressable row is named by its label alone; the rest of its text describes it.
  const pressableLabel = {
    "aria-labelledby": labelId,
    "aria-describedby": describedBy([
      status != null && statusId,
      hint != null && hintId,
      value != null && valueId,
    ]),
  };
  const text = (
    <RowText
      label={label}
      hint={hint}
      status={status}
      labelId={labelId}
      statusId={statusId}
      hintId={hintId}
    />
  );
  const valueText = value != null && (
    <span id={valueId} className="shrink-0 text-muted-foreground max-sm:text-[15px]">
      {value}
    </span>
  );
  const pressable = cn(
    rowClassName,
    pressableRowClassName,
    danger && "text-destructive",
    className,
  );

  if (href !== undefined) {
    return (
      <WouterLink href={href} className={pressable} {...pressableLabel}>
        {text}
        {valueText}
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </WouterLink>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={pressable} {...pressableLabel}>
        {text}
        {valueText}
      </button>
    );
  }
  return (
    <div className={cn(rowClassName, className)}>
      {text}
      {control != null && (
        <RowLabelContext value={controlLabel}>
          <div className="flex shrink-0 items-center gap-2">{control}</div>
        </RowLabelContext>
      )}
    </div>
  );
}

/** Named by its row's label, described by its status and hint. */
export function SettingsSwitch(props: Omit<ComponentProps<typeof Switch>, "size">) {
  const row = use(RowLabelContext);
  return (
    <Switch
      size="lg"
      aria-labelledby={row?.labelId}
      aria-describedby={row?.describedBy}
      {...props}
    />
  );
}

type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon };

export function SettingsSegmented<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  const row = use(RowLabelContext);
  return (
    <ToggleGroup
      variant="segmented"
      aria-labelledby={row?.labelId}
      aria-describedby={row?.describedBy}
      className={className}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked) onValueChange(picked);
      }}
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <ToggleGroupItem key={optionValue} value={optionValue}>
          {Icon && <Icon aria-hidden="true" />}
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A `SelectTrigger` sized for a row, named by its label. Goes inside a `Select`. */
export function SettingsSelectTrigger({
  className,
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "size">) {
  const row = use(RowLabelContext);
  return (
    <SelectTrigger
      size="md"
      aria-labelledby={row?.labelId}
      aria-describedby={row?.describedBy}
      className={cn("sm:min-w-50", className)}
      {...props}
    />
  );
}
