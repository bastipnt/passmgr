import { Button } from "@repo/ui/components/Button";
import { SelectTrigger } from "@repo/ui/components/Select";
import { Switch } from "@repo/ui/components/Switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ToggleGroup";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { type StatusTone, toneTextClassName, toneTileClassName } from "@repo/ui/lib/tone";
import { cn } from "@repo/ui/lib/utils";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  use,
  useId,
} from "react";
import { Link as WouterLink } from "wouter";
import { useGroupVariant } from "./SettingsGroup";

/** What names and describes a row's control: the label; the status and the hint. */
type RowLabel = { labelId: string; describedBy: string | undefined };

const RowLabelContext = createContext<RowLabel | null>(null);

type RowStatus = { label: string; tone: StatusTone };

type RowTextProps = {
  /** A tile before the text (the phone's section list, a device, an event). */
  icon?: LucideIcon;
  /** Colors the icon tile (a warning event, a synced vault). */
  iconTone?: StatusTone;
  /** A leading element of its own in place of `icon` (a vault's tile). */
  media?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  /** Shown after the label ("Two-factor authentication · Off"): describes the control, doesn't name it. */
  status?: RowStatus;
};

type SettingsRowProps = RowTextProps & { className?: string } & (
    | {
        /** Right-hand control: a button, `SettingsSwitch`, `SettingsSegmented`, a select. */
        control?: ReactNode;
        /** On a phone the control goes under the text, full width. */
        stackOnPhone?: boolean;
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
        stackOnPhone?: never;
      }
    | {
        /** The whole row is a button (opens a dialog), with `value`. */
        onClick: () => void;
        href?: never;
        value?: ReactNode;
        control?: never;
        stackOnPhone?: never;
      }
  );

const rowClassName =
  "flex min-h-15 w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-500 data-highlighted:bg-primary/10 max-sm:min-h-14 max-sm:gap-3 max-sm:px-4.5 max-sm:py-2.5";

const pressableRowClassName =
  "outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

function RowText({
  icon: Icon,
  iconTone = "neutral",
  media,
  label,
  hint,
  status,
  labelId,
  statusId,
  hintId,
}: RowTextProps & { labelId: string; statusId: string; hintId: string }) {
  return (
    <>
      {media}
      {!media && Icon && (
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl max-sm:size-7.5 max-sm:rounded-[10px] [&_svg]:size-4",
            toneTileClassName[iconTone],
          )}
        >
          <Icon />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 max-sm:gap-0">
        <span className="font-medium text-sm leading-5 max-sm:font-normal max-sm:text-base max-sm:leading-6">
          <span id={labelId} data-settings-label="">
            {label}
          </span>
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
    </>
  );
}

function describedBy(ids: (string | false)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function useRowIds() {
  return { labelId: useId(), statusId: useId(), hintId: useId(), valueId: useId() };
}

function RowValue({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="shrink-0 text-muted-foreground max-sm:text-[15px]">
      {children}
    </span>
  );
}

/** Ids, name and description of a whole-row button or link: named by its label alone. */
function usePressableRow({
  status,
  hint,
  value,
  className,
}: Pick<RowTextProps, "status" | "hint"> & { value?: ReactNode; className?: string }) {
  const danger = useGroupVariant() === "danger";
  const ids = useRowIds();
  return {
    ids,
    props: {
      "data-settings-row": "",
      className: cn(rowClassName, pressableRowClassName, danger && "text-destructive", className),
      "aria-labelledby": ids.labelId,
      "aria-describedby": describedBy([
        status != null && ids.statusId,
        hint != null && ids.hintId,
        value != null && ids.valueId,
      ]),
    },
  };
}

function PressableRowContent({
  ids,
  value,
  chevron,
  ...text
}: RowTextProps & { ids: ReturnType<typeof useRowIds>; value?: ReactNode; chevron: boolean }) {
  return (
    <>
      <RowText {...text} labelId={ids.labelId} statusId={ids.statusId} hintId={ids.hintId} />
      {value != null && <RowValue id={ids.valueId}>{value}</RowValue>}
      {chevron && (
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );
}

type SettingsRowButtonProps = RowTextProps &
  Omit<ComponentProps<"button">, "children" | "value"> & {
    value?: ReactNode;
    chevron?: boolean;
  };

/**
 * A whole row that is a button, named by its label. Takes the props a trigger
 * passes, so it can be a dialog's trigger itself (`<ChangePasswordDialog><SettingsRowButton …/>`).
 */
export function SettingsRowButton({
  icon,
  iconTone,
  media,
  label,
  hint,
  status,
  value,
  chevron = false,
  className,
  ...props
}: SettingsRowButtonProps) {
  const pressable = usePressableRow({ status, hint, value, className });
  return (
    <button type="button" {...props} {...pressable.props}>
      <PressableRowContent
        ids={pressable.ids}
        icon={icon}
        iconTone={iconTone}
        media={media}
        label={label}
        hint={hint}
        status={status}
        value={value}
        chevron={chevron}
      />
    </button>
  );
}

function SettingsRowLink({
  href,
  value,
  className,
  ...text
}: RowTextProps & { href: string; value?: ReactNode; className?: string }) {
  const pressable = usePressableRow({ status: text.status, hint: text.hint, value, className });
  return (
    <WouterLink href={href} {...pressable.props}>
      <PressableRowContent ids={pressable.ids} value={value} chevron {...text} />
    </WouterLink>
  );
}

function ControlRow({
  control,
  stackOnPhone,
  className,
  ...text
}: RowTextProps & { control?: ReactNode; stackOnPhone: boolean; className?: string }) {
  const { labelId, statusId, hintId } = useRowIds();
  const controlLabel: RowLabel = {
    labelId,
    describedBy: describedBy([text.status != null && statusId, text.hint != null && hintId]),
  };
  return (
    <div
      data-settings-row=""
      className={cn(
        rowClassName,
        stackOnPhone && "max-sm:flex-col max-sm:items-stretch",
        className,
      )}
    >
      <RowText {...text} labelId={labelId} statusId={statusId} hintId={hintId} />
      {control != null && (
        <RowLabelContext value={controlLabel}>
          <div
            className={cn("flex shrink-0 items-center gap-2", stackOnPhone && "max-sm:*:flex-1")}
          >
            {control}
          </div>
        </RowLabelContext>
      )}
    </div>
  );
}

/** Label and one-line hint on the left, a control (or a drill-down) on the right. */
export function SettingsRow({
  control,
  stackOnPhone = false,
  href,
  onClick,
  value,
  className,
  ...text
}: SettingsRowProps) {
  if (onClick)
    return <SettingsRowButton {...text} value={value} onClick={onClick} className={className} />;
  if (href !== undefined)
    return <SettingsRowLink {...text} href={href} value={value} className={className} />;
  return (
    <ControlRow {...text} control={control} stackOnPhone={stackOnPhone} className={className} />
  );
}

/** Row buttons are compact on a phone, as the row itself is (56px). */
export function useSettingsButtonSize() {
  return useIsMobile() ? "sm" : "default";
}

type SettingsActionRowProps = Pick<RowTextProps, "label" | "hint"> & {
  phoneHint?: ReactNode;
  /** Wraps the trigger in its dialog: `(trigger) => <ChangePasswordDialog>{trigger}</ChangePasswordDialog>`. */
  dialog: (trigger: ReactElement) => ReactElement;
  buttonLabel: string;
  buttonVariant?: ComponentProps<typeof Button>["variant"];
  /** The phone row's value before its chevron ("Change"); a row without one has no chevron. */
  phoneValue?: string;
  disabled?: boolean;
};

/**
 * A row that opens a dialog: on desktop a button at its end, on a phone the
 * whole row (`SettingsRowButton`).
 */
export function SettingsActionRow({
  label,
  hint,
  phoneHint,
  dialog,
  buttonLabel,
  buttonVariant = "outline",
  phoneValue,
  disabled,
}: SettingsActionRowProps) {
  if (useIsMobile())
    return dialog(
      <SettingsRowButton
        label={label}
        hint={phoneHint ?? hint}
        value={phoneValue}
        chevron={phoneValue !== undefined}
        disabled={disabled}
      />,
    );
  return (
    <SettingsRow
      label={label}
      hint={hint}
      control={dialog(
        <Button variant={buttonVariant} disabled={disabled}>
          {buttonLabel}
        </Button>,
      )}
    />
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
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  /** Its name outside a row (a page's sort toggle). */
  "aria-label"?: string;
}) {
  const row = use(RowLabelContext);
  return (
    <ToggleGroup
      variant="segmented"
      aria-label={ariaLabel}
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
