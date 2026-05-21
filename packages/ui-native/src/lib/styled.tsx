import React from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from "react-native";

export const View = RNView as React.ComponentType<ViewProps & { className?: string }>;
export const Text = RNText as React.ComponentType<TextProps & { className?: string }>;
export const Pressable = RNPressable as React.ComponentType<
  PressableProps & { className?: string }
>;
export const TextInput = RNTextInput as React.ComponentType<
  TextInputProps & { className?: string }
>;
