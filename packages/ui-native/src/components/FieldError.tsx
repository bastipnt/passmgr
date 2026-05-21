import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "../theme/tokens";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {errors.map((e, i) => (
        <Text key={i} style={styles.text}>
          {e.message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  text: {
    fontSize: fontSize.sm,
    color: colors.danger,
  },
});
