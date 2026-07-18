import { type ReactNode, useState } from "react";
import { Pressable, View, Text } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { Button } from "../Button";
import { Link } from "../Link";

const HIDDEN_VALUE = "••••••••••••" as const;

const hiddenVariants = ["password", "hidden"] as const;
const multipleValuesVariants = ["websites"] as const;
const singleValueVariants = ["default", "noAction", ...hiddenVariants] as const;
const variants = [...hiddenVariants, ...multipleValuesVariants, ...singleValueVariants] as const;

type ValueProps = {
  value?: string | string[];
  hidden?: boolean;
  variant: (typeof variants)[number];
};

function Value({ value, hidden, variant }: ValueProps) {
  const valueToDisplay = hidden ? HIDDEN_VALUE : (value ?? "-");
  const usesLinks = variant === "websites";

  if (typeof valueToDisplay === "string") {
    return <Text className="text-md text-foreground">{valueToDisplay}</Text>;
  }

  return (
    <View className="gap-md pt-sm">
      {valueToDisplay.map((v, i) => (
        <View key={`item-${v}-${i}`}>
          {usesLinks ? (
            <Link target="_blank" href={v}>
              {v}
            </Link>
          ) : (
            <Text className="text-md text-foreground">{v}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

type BaseRecordDetailsItemProps = {
  icon: ReactNode;
  title: string;
  /** Rendered at the trailing edge, e.g. a countdown ring. */
  accessory?: ReactNode;
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

export function RecordDetailsItem({
  icon,
  title,
  value,
  variant = "default",
  onCopy,
  accessory,
}: SingleRecordDetailsItemProps | MultipleRecordDetailsItemProps) {
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);
  const iconColor = useCSSVariable("--color-foreground") as string;

  return (
    <Pressable
      onPress={onCopy}
      className="flex-row items-start gap-lg bg-card p-md"
      style={({ pressed }) => (pressed && onCopy ? { opacity: 0.7 } : null)}
    >
      <View className="pt-sm">{icon}</View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-muted-foreground">{title}</Text>
        <Value hidden={usesHiddenValue && valueHidden} value={value} variant={variant} />
      </View>
      {accessory}
      {usesHiddenValue && (
        <Button
          variant="ghost"
          size="icon-lg"
          className="rounded-full"
          onPress={() => setValueHidden((h) => !h)}
        >
          {valueHidden ? (
            <Eye size={18} color={iconColor} />
          ) : (
            <EyeOff size={18} color={iconColor} />
          )}
        </Button>
      )}
    </Pressable>
  );
}
