import { type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { View } from "../lib/styled";

export function FieldGroup({
  children,
  className,
  style,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View className={cn("gap-3", className)} style={style} {...rest}>
      {children}
    </View>
  );
}
