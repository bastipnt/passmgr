import { View, type ViewProps } from "react-native";

export function FieldGroup({ children, ...props }: ViewProps & { className?: string }) {
  return (
    <View className="gap-md" {...props}>
      {children}
    </View>
  );
}
