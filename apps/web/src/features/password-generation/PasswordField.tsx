import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import { KeyRoundIcon, WandSparklesIcon } from "lucide-react";
import { useMemo } from "react";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import PasswordGenerator from "./PasswordGenerator";
import PasswordStrengthMeter from "./PasswordStrengthMeter";

/** Any form with a `password` field: a login, a Wi-Fi network. */
type PasswordFormValues = { password?: string };

type PasswordFieldProps<T extends PasswordFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
};

export default function PasswordField<T extends PasswordFormValues>(props: PasswordFieldProps<T>) {
  // react-hook-form's paths don't narrow through a generic: pin the form to its
  // `password` field, the only one this component touches.
  const { control, setValue } = props as unknown as PasswordFieldProps<PasswordFormValues>;
  const password = useWatch({ control, name: "password" }) ?? "";
  const pwGeneratorHandle = useMemo(() => createHandle(), []);

  return (
    <div className="flex flex-col gap-2">
      <ControlledInput
        className="font-mono [-webkit-text-security:disc] focus:[-webkit-text-security:none]"
        control={control}
        name="password"
        label="Password"
        type="text"
        autoComplete="off"
        spellCheck={false}
        leadingIcon={<KeyRoundIcon />}
        addon={
          <InputGroupAddon align="inline-end">
            <DialogTrigger
              handle={pwGeneratorHandle}
              render={
                <InputGroupButton variant="outline" title="Generate password">
                  <WandSparklesIcon />
                  Generate
                </InputGroupButton>
              }
            />
          </InputGroupAddon>
        }
      />
      {password && (
        <PasswordStrengthMeter
          password={password}
          aside={<span className="tabular-nums">{password.length} characters</span>}
        />
      )}
      <PasswordGenerator
        handle={pwGeneratorHandle}
        onUse={(pwd) => setValue("password", pwd, { shouldDirty: true, shouldValidate: true })}
      />
    </div>
  );
}
