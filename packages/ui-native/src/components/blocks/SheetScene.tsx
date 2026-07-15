import { type ReactNode } from "react";
import { Platform, View, Text } from "react-native";
import { Button } from "../Button";
import { KeyboardAvoidingView } from "../KeyboardAvoidingView";
import { Spinner } from "../Spinner";
import { CloseChip } from "./CloseChip";

export type SheetSceneProps = {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  loading?: boolean;
  children: ReactNode;
};

/**
 * Shared layout for the sign-in / sign-up form-sheets: header (title + subtitle +
 * close chip), the form content, a flex spacer, and a bottom-pinned primary action.
 */
export function SheetScene({
  title,
  subtitle,
  actionLabel,
  onAction,
  actionDisabled,
  loading,
  children,
}: SheetSceneProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <View className="flex-1 bg-background p-lg">
        <View className="mb-[22px] flex-row items-start justify-between">
          <View className="gap-[6px]">
            <Text
              className="font-bold text-foreground"
              style={{ fontSize: 26, letterSpacing: -0.5 }}
            >
              {title}
            </Text>
            <Text className="text-sm text-muted-foreground">{subtitle}</Text>
          </View>
          <CloseChip />
        </View>

        <View className="mb-lg flex-1 justify-center gap-lg">{children}</View>

        <Button
          size="lg"
          textClassName="font-bold"
          disabled={actionDisabled || loading}
          onPress={onAction}
          icon={loading ? <Spinner colorClassName="text-primary-foreground" /> : undefined}
        >
          {actionLabel}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
