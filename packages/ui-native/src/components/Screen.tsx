import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/utils";
import { LightField } from "./LightField";

export type ScreenProps = {
  children: ReactNode;
  className?: string;
  /** The light field behind the content (auth screens); signed in, the ground is flat. */
  field?: boolean;
};

/** Screen root, with the light field (if any) pinned behind the (usually scrolling) content. */
export function Screen({ children, className, field = false }: ScreenProps) {
  return (
    <View className={cn("flex-1 bg-background", className)}>
      {field && <LightField />}
      {children}
    </View>
  );
}
