import React, { ReactNode, useState } from "react";
import { ListItem, Text, View, YGroup, YStack } from "tamagui";
import { Button } from "../Button";
import { Eye, EyeOff } from "@tamagui/lucide-icons-2";
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

  return (
    <ListItem.Text
      whiteSpace="pre-line"
      style={{ overflowWrap: "break-word" }}
      color="$black06"
      unstyled
    >
      {typeof valueToDisplay === "string" ? (
        valueToDisplay
      ) : (
        <YGroup gap="$md" pt="$sm">
          {valueToDisplay.map((v, i) => (
            <YGroup.Item key={`item-${v}-${i}`}>
              {usesLinks ? (
                <Link target="_blank" href={v}>
                  {v}
                </Link>
              ) : (
                <Text>{v}</Text>
              )}
            </YGroup.Item>
          ))}
        </YGroup>
      )}
    </ListItem.Text>
  );
}

type BaseRecordDetailsItemProps = {
  icon: ReactNode;
  title: string;
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

const ListItemIcon = function ({ children }: { children: ReactNode }) {
  return (
    <View pt="$sm">
      <ListItem.Icon>{children}</ListItem.Icon>
    </View>
  );
};

export function RecordDetailsItem({
  icon,
  title,
  value,
  variant = "default",
  onCopy,
}: SingleRecordDetailsItemProps | MultipleRecordDetailsItemProps) {
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);

  return (
    <ListItem.Frame onPress={onCopy} gap="$lg" bg="$accent10" items="flex-start">
      <ListItemIcon>{icon}</ListItemIcon>
      <YStack flex={1}>
        <ListItem.Title>{title}</ListItem.Title>
        <Value hidden={usesHiddenValue && valueHidden} value={value} variant={variant} />
      </YStack>
      {usesHiddenValue && (
        <Button circular size="$lg" onPress={() => setValueHidden((h) => !h)}>
          {valueHidden ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </ListItem.Frame>
  );
}
