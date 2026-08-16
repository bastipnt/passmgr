import type { LoginRecord } from "@repo/schema";
import { Button, SheetActions } from "@repo/ui-native";
import { type Href, useRouter } from "expo-router";
import { type ReactNode, useRef } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import LoginRecordForm, {
  type LoginRecordFormHandle,
} from "@/features/records/components/LoginRecordForm";

type RecordFormSheetProps = {
  onSubmit: (data: LoginRecord) => void;
  /** Route of the generator sheet this screen's password field opens. */
  generatorPath: Href;
  /** Label of the submit button. */
  action: string;
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
  serverError,
  defaultValues,
  children,
}: RecordFormSheetProps) {
  const router = useRouter();
  const formRef = useRef<LoginRecordFormHandle>(null);

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-md p-md pt-[80px]"
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

      <SheetActions>
        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="xmark"
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />

        <Button
          hug
          variant="glass-primary"
          size="lg"
          onPress={() => formRef.current?.triggerSubmit()}
        >
          {action}
        </Button>
      </SheetActions>
    </View>
  );
}
