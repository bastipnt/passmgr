import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/utils";
import { LightField, type LightFieldIntensity } from "./LightField";

export type ScreenProps = {
  children: ReactNode;
  className?: string;
  /** Light-field strength behind the content. Defaults to the signed-in `dim`. */
  field?: LightFieldIntensity;
};

/** Screen root: the light field pinned behind the (usually scrolling) content. */
export function Screen({ children, className, field = "dim" }: ScreenProps) {
  return (
    <View className={cn("flex-1 bg-background", className)}>
      <LightField intensity={field} />
      {children}
    </View>
  );
}
