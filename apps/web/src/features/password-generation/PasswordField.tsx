import { type LoginRecord as FormValues } from "@repo/schema";
import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import { KeyRoundIcon, WandSparklesIcon } from "lucide-react";
import { useMemo } from "react";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import PasswordGenerator from "./PasswordGenerator";
import PasswordStrengthMeter from "./PasswordStrengthMeter";

type PasswordFieldProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function PasswordField({ control, setValue }: PasswordFieldProps) {
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
