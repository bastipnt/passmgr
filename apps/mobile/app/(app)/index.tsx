import { useContext } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SessionContext } from "@repo/client";
import { Button, colors, fontSize, spacing } from "@repo/ui-native";

export default function HomeScreen() {
  const { sessionId } = useContext(SessionContext);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logged in</Text>
      <Text style={styles.subtitle}>session id: {sessionId ?? "unknown"}</Text>
      <Text style={styles.hint}>
        Auth flow works. Vault, records, biometric come in follow-up plans.
      </Text>
      <View style={styles.spacer} />
      <Button
        variant="secondary"
        onPress={() => {
          // TODO: real logout. For v1 user can kill the app.
        }}
      >
        (logout not yet implemented)
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  spacer: {
    height: spacing.lg,
  },
});
