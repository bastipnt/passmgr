import type { RecordFormValues, RecordType } from "@repo/schema";
import { type Href, Stack, useRouter } from "expo-router";
import { type ReactNode, type Ref, useRef } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import LoginRecordForm from "./LoginRecordForm";
import TypedRecordForm, { type OtherRecordType } from "./TypedRecordForm";

export type RecordFormHandle = {
  triggerSubmit: () => void;
};

type RecordFormSheetProps<T extends RecordType> = {
  type: T;
  onSubmit: (data: RecordFormValues<T>) => void;
  /** Route of the generator sheet this screen's password field opens. */
  generatorPath: Href;
  /** Label of the submit button, and of the sheet's header. */
  action: string;
  /** Title shown in the sheet's header. */
  title: string;
  serverError?: string;
  /** A save is in flight: locks the form and its submit action. */
  pending?: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  /** Rendered below the form — e.g. the edit screen's delete button. */
  children?: ReactNode;
};

type FormProps<T extends RecordType> = {
  onSubmit: (data: RecordFormValues<T>) => void;
  serverError?: string;
  disabled: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  generatorPath: Href;
  ref: Ref<RecordFormHandle>;
};

/**
 * Sheet scaffold around the type's form (`LoginRecordForm` or
 * `TypedRecordForm`): scroll area, close/submit actions and the imperative
 * submit handle. Shared by the create and edit screens so both stay in sync;
 * only the mutation differs.
 */
export default function RecordFormSheet<T extends RecordType>({
  type,
  onSubmit,
  generatorPath,
  action,
  title,
  serverError,
  pending = false,
  defaultValues,
  children,
}: RecordFormSheetProps<T>) {
  const router = useRouter();
  const formRef = useRef<RecordFormHandle>(null);
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;

  const formProps: FormProps<T> = {
    onSubmit,
    serverError,
    disabled: pending,
    defaultValues,
    generatorPath,
    ref: formRef,
  };

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
              disabled: pending,
              onPress: () => formRef.current?.triggerSubmit(),
            },
          ],
        }}
      />

      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-6 px-5 py-6"
        bottomOffset={24}
      >
        {/* TODO: login should also use TypedRecordForm */}
        {type === "login" ? (
          <LoginRecordForm {...(formProps as unknown as FormProps<"login">)} />
        ) : (
          <TypedRecordForm
            type={type as OtherRecordType}
            {...(formProps as unknown as FormProps<OtherRecordType>)}
          />
        )}

        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}
