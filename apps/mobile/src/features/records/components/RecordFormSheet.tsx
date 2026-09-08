import type { LoginRecord } from "@repo/schema";
import { type Href, Stack, useRouter } from "expo-router";
import { type ReactNode, useRef } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import LoginRecordForm, {
  type LoginRecordFormHandle,
} from "@/features/records/components/LoginRecordForm";

type RecordFormSheetProps = {
  onSubmit: (data: LoginRecord) => void;
  /** Route of the generator sheet this screen's password field opens. */
  generatorPath: Href;
  /** Label of the submit button, and of the sheet's header. */
  action: string;
  /** Title shown in the sheet's header. */
  title: string;
  serverError?: string;
  defaultValues?: Partial<LoginRecord>;
  /** Rendered below the form — e.g. the edit screen's delete button. */
  children?: ReactNode;
};

/**
 * Sheet scaffold around `LoginRecordForm`: scroll area, close/submit actions
 * and the imperative submit handle. Shared by the create and edit screens so
 * both stay in sync; only the mutation differs.
 */
export default function RecordFormSheet({
  onSubmit,
  generatorPath,
  action,
  title,
  serverError,
  defaultValues,
  children,
}: RecordFormSheetProps) {
  const router = useRouter();
  const formRef = useRef<LoginRecordFormHandle>(null);
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;

  return (
    <View className="flex-1">
      {/*
       * The sheet's own native header. The actions have to be real
       * `UIBarButtonItem`s — a React element in the header is wrapped in a
       * liquid glass capsule of UIKit's own, which our glass buttons would then
       * sit on top of instead of the content behind them. The bar stays
       * transparent so the list scrolls under it, as before.
       */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title,
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: action,
              variant: "prominent",
              tintColor: primaryColor,
              onPress: () => formRef.current?.triggerSubmit(),
            },
          ],
        }}
      />

      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-md p-md"
        bottomOffset={24}
      >
        <LoginRecordForm
          onSubmit={onSubmit}
          serverError={serverError}
          defaultValues={defaultValues}
          action={action}
          generatorPath={generatorPath}
          ref={formRef}
        />

        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}
