import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { type LoginItem as FormValues } from "@repo/schema";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import PasswordGeneratorSheet from "@features/password-generation/components/PasswordGeneratorSheet";
import { DicesIcon, KeyIcon } from "lucide-react";
import { PasswordStrengthBar } from "@features/password-generation/components/PasswordStrengthBar";
import { getStrengthFromString } from "@repo/crypto";

type PasswordFieldProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function PasswordField({ control, setValue }: PasswordFieldProps) {
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = password ? getStrengthFromString(password) : null;

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
            <PasswordGeneratorSheet
              onUse={(pwd) =>
                setValue("password", pwd, { shouldDirty: true, shouldValidate: true })
              }
            >
              <InputGroupButton size="icon-xs" title="Generate password">
                <DicesIcon />
              </InputGroupButton>
            </PasswordGeneratorSheet>
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
    </div>
  );
}
