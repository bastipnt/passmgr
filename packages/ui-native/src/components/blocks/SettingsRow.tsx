import { ChevronRight } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { SectionGroup, SectionHeading } from "./Section";

type SettingsGroupProps = {
  children: ReactNode;
  className?: string;
};

/** Flush run of settings rows — web's settings overview list at phone width. */
export function SettingsGroup({ children, className }: SettingsGroupProps) {
  return <SectionGroup className={className}>{children}</SectionGroup>;
}

type SettingsNavRowProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onPress: () => void;
};

/** Full-bleed row that pushes another screen, with a chevron. */
export function SettingsNavRow({ title, description, icon, onPress }: SettingsNavRowProps) {
  const mutedForeground = useCSSVariable("--color-muted-foreground") as string;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3.5 px-5 py-2 active:bg-foreground/5"
    >
      {icon}
      <View className="flex-1">
        <Text className="text-[16px] text-foreground">{title}</Text>
        {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      </View>
      <ChevronRight size={18} color={mutedForeground} style={{ opacity: 0.6 }} />
    </Pressable>
  );
}

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Children run edge to edge (a `SectionGroup`/`OptionList`); otherwise they get the 20px gutter. */
  flush?: boolean;
};

/** Titled block holding one control: uppercase heading, the control, a muted hint. */
export function SettingsSection({ title, description, children, flush }: SettingsSectionProps) {
  return (
    <View className="gap-2">
      <SectionHeading>{title}</SectionHeading>
      {flush ? children : <View className="px-5">{children}</View>}
      {description ? (
        <Text className="px-5 text-muted-foreground text-xs leading-4">{description}</Text>
      ) : null}
    </View>
  );
}
