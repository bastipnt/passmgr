import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";
import { colors, fontSize, radius, spacing } from "../theme/tokens";

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function CardHeader({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.header, style]} {...rest}>
      {children}
    </View>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function CardAction({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.action, style]} {...rest}>
      {children}
    </View>
  );
}

export function CardContent({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.content, style]} {...rest}>
      {children}
    </View>
  );
}

export function CardFooter({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.footer, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  content: {
    gap: spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
});
