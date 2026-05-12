import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { type LoginItem as FormValues } from "@repo/schema";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import PasswordGenerator from "@features/password-generation/pages/PasswordGenerator";
import { DicesIcon, KeyIcon } from "lucide-react";
import { PasswordStrengthBar } from "@features/password-generation/components/PasswordStrengthBar";
import { getStrengthFromString } from "@repo/crypto";
import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";

type PasswordFieldProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function PasswordField({ control, setValue }: PasswordFieldProps) {
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = password ? getStrengthFromString(password) : null;
  const pwGeneratorHandle = createHandle();

  return (
    <div className="flex flex-col gap-1.5">
      <ControlledInput
        className="[-webkit-text-security:disc] focus:[-webkit-text-security:none]"
        control={control}
        name="password"
        label="Password"
        type="text"
        autoComplete="off"
        icon={<KeyIcon />}
        addon={
          <InputGroupAddon align="inline-end">
            <DialogTrigger
              handle={pwGeneratorHandle}
              render={
                <InputGroupButton size="icon-xs" title="Generate password">
                  <DicesIcon />
                </InputGroupButton>
              }
            />
          </InputGroupAddon>
        }
      />
      {strength && (
        <PasswordStrengthBar
          className="pl-6"
          level={strength.level}
          label={strength.label}
          bits={strength.bits}
        />
      )}
      <PasswordGenerator
        handle={pwGeneratorHandle}
        onUse={(pwd) => setValue("password", pwd, { shouldDirty: true, shouldValidate: true })}
      />
    </div>
  );
}
