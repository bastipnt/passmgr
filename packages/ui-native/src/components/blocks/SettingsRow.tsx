import { ChevronRight } from "lucide-react-native";
import { Children, Fragment, type ReactElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { cn } from "../../lib/utils";

type SettingsGroupProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Card wrapping a run of settings rows, hairline-separated — the native shape of
 * web's `ItemGroup`.
 *
 * The separator is a plain `View` rather than the exported `Separator`, which
 * wraps a SwiftUI `Divider` and so renders nothing on Android.
 */
export function SettingsGroup({ children, className }: SettingsGroupProps) {
  // `toArray` assigns every child a stable key, so the separators keyed off it
  // survive a reorder — `children` here is JSX, not a mapped list.
  const rows = Children.toArray(children) as ReactElement[];

  return (
    <View className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 && <View className="h-px bg-border" />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type SettingsNavRowProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onPress: () => void;
};

/** Tappable row that pushes another screen — web's sidebar `Item` with a chevron. */
export function SettingsNavRow({ title, description, icon, onPress }: SettingsNavRowProps) {
  const mutedForeground = useCSSVariable("--color-muted-foreground") as string;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-lg p-md"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {icon}
      <View className="flex-1">
        <Text className="text-foreground text-md">{title}</Text>
        {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      </View>
      <ChevronRight size={18} color={mutedForeground} />
    </Pressable>
  );
}

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

/** Titled block holding one control — web's `Item` + `ItemTitle` + `ItemDescription`. */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <View className="gap-sm rounded-lg border border-border bg-card p-md">
      <Text className="font-semibold text-foreground text-md">{title}</Text>
      {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      {children}
    </View>
  );
}
