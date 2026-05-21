import { StyleSheet, View, type ViewProps } from "react-native";
import { spacing } from "../theme/tokens";

export function FieldGroup({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.group, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.md,
  },
});
