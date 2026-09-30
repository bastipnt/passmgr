import type { PasswordStrength, PasswordStrengthLevel } from "@repo/util";
import { BadgeCheck, Eye, EyeOff, ShieldAlert } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { cn } from "../../lib/utils";
import { Badge, badgeTextVariants } from "../Badge";
import { Link } from "../Link";

const HIDDEN_VALUE = "••••••••••••" as const;

const hiddenVariants = ["password", "hidden"] as const;
const multipleValuesVariants = ["websites"] as const;
const singleValueVariants = ["default", "noAction", ...hiddenVariants] as const;
const variants = [...hiddenVariants, ...multipleValuesVariants, ...singleValueVariants] as const;

const STRENGTH_BADGE: Record<PasswordStrengthLevel, "destructive" | "warning" | "success"> = {
  weak: "destructive",
  fair: "warning",
  strong: "success",
  "very-strong": "success",
};

const BADGE_ICON_COLOR = {
  destructive: "--color-destructive",
  warning: "--color-warning",
  success: "--color-success",
} as const;

function StrengthBadge({ strength }: { strength: PasswordStrength }) {
  const variant = STRENGTH_BADGE[strength.level];
  const Icon = variant === "success" ? BadgeCheck : ShieldAlert;
  const color = useCSSVariable(BADGE_ICON_COLOR[variant]) as string;

  return (
    <Badge variant={variant}>
      <Text className={badgeTextVariants({ variant })}>{strength.label}</Text>
      <Icon size={12} color={color} />
    </Badge>
  );
}

type ValueProps = {
  value?: string | string[];
  hidden?: boolean;
  variant: (typeof variants)[number];
  mono?: boolean;
};

function Value({ value, hidden, variant, mono }: ValueProps) {
  const valueToDisplay = hidden ? HIDDEN_VALUE : value || "-";

  if (typeof valueToDisplay === "string") {
    return (
      <Text
        numberOfLines={variant === "default" ? undefined : 1}
        className={cn("text-[15px] text-foreground", mono && "font-mono")}
      >
        {valueToDisplay}
      </Text>
    );
  }

  return (
    <View className="gap-1.5 pt-0.5">
      {valueToDisplay.map((v, i) =>
        variant === "websites" ? (
          <Link key={`item-${v}-${i}`} target="_blank" href={v}>
            {v}
          </Link>
        ) : (
          <Text key={`item-${v}-${i}`} className="text-[15px] text-foreground">
            {v}
          </Text>
        ),
      )}
    </View>
  );
}

type BaseRecordDetailsItemProps = {
  icon: ReactNode;
  title: string;
  /** Rendered at the trailing edge, e.g. a countdown ring. */
  accessory?: ReactNode;
  /** Re-hide a revealed value after this many ms. `0` keeps it revealed. */
  revealTimeoutMs?: number;
  /** Strength badge beside the label (password rows). */
  strength?: PasswordStrength;
  /** Render the value in the mono face (tokens, secrets). */
  mono?: boolean;
};

type SingleRecordDetailsItemProps = BaseRecordDetailsItemProps & {
  value?: string;
  onCopy?: () => void;
  variant?: (typeof singleValueVariants)[number];
};

type MultipleRecordDetailsItemProps = BaseRecordDetailsItemProps & {
  value?: string[];
  onCopy?: undefined;
  variant?: (typeof multipleValuesVariants)[number];
};

/**
 * One field of a record, as web's `ItemDisplay` at phone width: icon tile,
 * small label, value — and the whole row is the copy button. Secrets get a
 * trailing eye toggle.
 */
export function RecordDetailsItem({
  icon,
  title,
  value,
  variant = "default",
  onCopy,
  accessory,
  revealTimeoutMs = 0,
  strength,
  mono,
}: SingleRecordDetailsItemProps | MultipleRecordDetailsItemProps) {
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

  useEffect(() => {
    if (valueHidden || revealTimeoutMs <= 0) return;

    const timer = setTimeout(() => setValueHidden(true), revealTimeoutMs);
    return () => clearTimeout(timer);
  }, [valueHidden, revealTimeoutMs]);

  const hidden = usesHiddenValue && valueHidden;

  return (
    <View className="flex-row items-stretch">
      <Pressable
        onPress={onCopy}
        disabled={!onCopy}
        accessibilityRole={onCopy ? "button" : undefined}
        accessibilityHint={onCopy ? "Copies the value" : undefined}
        className={cn(
          "flex-1 flex-row items-center gap-2.5 py-3 pl-5",
          usesHiddenValue ? "pr-2" : "pr-5",
          onCopy && "active:bg-primary/8 dark:active:bg-foreground/5",
        )}
      >
        <View className="h-9 w-9 items-center justify-center rounded-sm border border-foreground/10 bg-foreground/3 dark:border-white/10">
          {icon}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-muted-foreground text-xs">{title}</Text>
            {variant === "password" && strength && <StrengthBadge strength={strength} />}
          </View>
          <Value hidden={hidden} value={value} variant={variant} mono={mono && !hidden} />
        </View>
        {accessory}
      </Pressable>
      {usesHiddenValue && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={valueHidden ? "Show value" : "Hide value"}
          onPress={() => setValueHidden((h) => !h)}
          className="w-14 items-center justify-center pr-2 active:bg-primary/8"
        >
          {valueHidden ? (
            <Eye size={20} color={iconColor} />
          ) : (
            <EyeOff size={20} color={iconColor} />
          )}
        </Pressable>
      )}
    </View>
  );
}
