import { zodResolver } from "@hookform/resolvers/zod";
import type { SecondFactorRequest } from "@repo/client";
import { type SecondFactorFormValues, secondFactorFormSchema } from "@repo/schema";
import { Button, ControlledInput, FieldError, FormLock } from "@repo/ui-native";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";

type SecondFactorStepProps = {
  request: SecondFactorRequest;
  onSubmit: (code: string) => void;
  onCancel: () => void;
};

/**
 * Web's `SecondFactorForm`: the second login step of an account with
 * two-factor on, in place of a sheet's form. The authenticator app's code, or
 * a backup code.
 */
export function SecondFactorStep({ request, onSubmit, onCancel }: SecondFactorStepProps) {
  const [backup, setBackup] = useState(false);
  const { handleSubmit, control, reset } = useForm<SecondFactorFormValues>({
    resolver: zodResolver(secondFactorFormSchema),
    defaultValues: { code: "" },
  });

  const submit = handleSubmit(({ code }) => {
    reset();
    onSubmit(code);
  });

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
          Two-factor code
        </Text>
        <Text className="text-muted-foreground text-sm">
          {backup
            ? "Enter one of your backup codes."
            : "Enter the code from your authenticator app."}
        </Text>
      </View>

      <FormLock locked={request.verifying} className="gap-5">
        <ControlledInput
          // A new field per mode: the one-time-code autofill only on the app's code.
          key={backup ? "backup" : "totp"}
          control={control}
          name="code"
          label={backup ? "Backup code" : "Authentication code"}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={backup ? "default" : "number-pad"}
          textContentType={backup ? "none" : "oneTimeCode"}
          autoComplete={backup ? "off" : "one-time-code"}
          placeholder={backup ? "xxxxx-xxxxx" : "123456"}
          onSubmitEditing={submit}
          note={
            <Pressable
              className="mt-1 self-end"
              hitSlop={8}
              onPress={() => {
                reset();
                setBackup(!backup);
              }}
            >
              <Text className="text-muted-foreground text-xs underline">
                {backup ? "Use the app's code" : "Use a backup code"}
              </Text>
            </Pressable>
          }
        />
      </FormLock>

      {request.invalid && !request.verifying && (
        <FieldError
          variant="box"
          errors={[
            {
              message: backup
                ? "That code didn't work. Each backup code works once."
                : "That code didn't work. Each code works once: if you just used it, wait for the next one.",
            },
          ]}
        />
      )}

      <View className="gap-3">
        <Button size="lg" loading={request.verifying} onPress={submit}>
          Verify
        </Button>
        <Button size="lg" variant="glass" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
