import {
  Host as ComposeHost,
  Text as ComposeText,
  DropdownMenu,
  DropdownMenuItem,
} from "@expo/ui/jetpack-compose";
import {
  Host,
  Menu,
  Picker,
  type ButtonProps as SwiftUIButtonProps,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  frame,
  imageScale,
  labelStyle,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { type ReactNode, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useCSSVariable, withUniwind } from "uniwind";

import { cn } from "../lib/utils";
import { Button } from "./Button";

type SFSymbolName = NonNullable<SwiftUIButtonProps["systemImage"]>;

export type MenuSelectOption<T extends string> = {
  value: T;
  label: string;
};

export type MenuSelectProps<T extends string> = {
  /** Currently selected option — marked in the menu. */
  value: T;
  options: readonly MenuSelectOption<T>[];
  onChange: (value: T) => void;
  /** iOS: SF Symbol drawn on the trigger. */
  systemImage: SFSymbolName;
  /** Trigger icon for the RN fallback (Android). */
  icon?: ReactNode;
  /** Section title above the options. */
  title?: string;
  accessibilityLabel: string;
  className?: string;
};

/** See `Button` — `.infinity` cannot cross the bridge. */
const FILL = 10_000;

const NativeHost = withUniwind(Host);

/**
 * Icon button that opens a native single-select menu — the counterpart of the
 * web `DropdownMenu` + `DropdownMenuRadioGroup`.
 *
 * iOS renders a SwiftUI `Menu` (the system context menu, opened on tap rather
 * than long-press) holding an inline `Picker`; Android renders the Material
 * `DropdownMenu` anchored to the trigger. Styled to match `Button`'s
 * `glass` / `icon-lg` so it sits next to the other `PageActions` buttons.
 */
export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  systemImage,
  icon,
  title,
  accessibilityLabel,
  className,
}: MenuSelectProps<T>) {
  const foreground = useCSSVariable("--color-foreground") as string;
  const primary = useCSSVariable("--color-primary") as string;
  const [open, setOpen] = useState(false);

  if (Platform.OS === "ios") {
    return (
      <NativeHost
        matchContents={{ horizontal: true }}
        className={cn("h-[52px] w-[52px] shrink-0", className)}
      >
        {/* The label doubles as the accessibility name: `iconOnly` hides its
            text but VoiceOver still reads it. */}
        <Menu
          label={accessibilityLabel}
          systemImage={systemImage}
          modifiers={[
            buttonStyle("glass"),
            controlSize("large"),
            tint(foreground),
            labelStyle("iconOnly"),
            imageScale("large"),
            frame({ maxWidth: FILL, maxHeight: FILL }),
          ]}
        >
          {/* Inline style keeps the options in the menu itself instead of
              pushing them into a submenu, and marks the selected one. */}
          <Picker
            label={title}
            selection={value}
            onSelectionChange={(selection) => onChange(selection as T)}
            modifiers={[pickerStyle("inline")]}
          >
            {options.map((option) => (
              <SwiftUIText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftUIText>
            ))}
          </Picker>
        </Menu>
      </NativeHost>
    );
  }

  return (
    <View className={cn("h-[52px] w-[52px] shrink-0", className)}>
      {/* The Compose host only anchors the popup — it draws nothing and must
          not swallow the trigger's touches, hence `none` and a first-child
          position (later siblings paint on top). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ComposeHost style={StyleSheet.absoluteFill}>
          <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
            <DropdownMenu.Items>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  elementColors={option.value === value ? { textColor: primary } : undefined}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                >
                  <DropdownMenuItem.Text>
                    <ComposeText>{option.label}</ComposeText>
                  </DropdownMenuItem.Text>
                </DropdownMenuItem>
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </ComposeHost>
      </View>

      <Button
        variant="glass"
        size="icon-lg"
        icon={icon}
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
      />
    </View>
  );
}
