import { useEffect, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { Button } from "../Button";
import { Spinner } from "../Spinner";
import { CloseChip } from "./CloseChip";
import { KeyboardAwareScrollView, KeyboardEvents } from "react-native-keyboard-controller";
import { cn } from "../../lib/utils";

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = KeyboardEvents.addListener("keyboardWillShow", () => {
      setKeyboardVisible(true);
    });

    const hide = KeyboardEvents.addListener("keyboardWillHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      mode="layout"
      contentContainerStyle={{ flex: keyboardVisible ? undefined : 1 }}
    >
      <View className={cn("p-lg gap-lg justify-between", !keyboardVisible && "flex-1")}>
        <View className={cn("flex-row items-start justify-between")}>
          <View className="gap-1">
            <Text className="text-2xl font-bold text-foreground">{title}</Text>
            <Text className="text-sm text-muted-foreground">{subtitle}</Text>
          </View>
          <CloseChip />
        </View>

        <View className={cn("justify-center gap-lg", !keyboardVisible && "flex-1")}>
          {children}
        </View>

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
    </KeyboardAwareScrollView>
  );
}
