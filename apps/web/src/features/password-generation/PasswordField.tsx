import { usePasswordStrength } from "@repo/client";
import { ControlledBoxedInput } from "@repo/ui/components/form/ControlledBoxedInput";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import GeneratePasswordButton from "./GeneratePasswordButton";
import PasswordStrengthMeter from "./PasswordStrengthMeter";

/** Any form with a `password` field: a login, a Wi-Fi network. */
type PasswordFormValues = { password?: string };

type PasswordFieldProps<T extends PasswordFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  label?: string;
};

export default function PasswordField<T extends PasswordFormValues>(props: PasswordFieldProps<T>) {
  // react-hook-form's paths don't narrow through a generic: pin the form to its
  // `password` field, the only one this component touches.
  const {
    control,
    setValue,
    label = "Password",
  } = props as unknown as PasswordFieldProps<PasswordFormValues>;
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = usePasswordStrength(password);

  return (
    <ControlledBoxedInput
      control={control}
      name="password"
      label={label}
      secret
      autoComplete="off"
      spellCheck={false}
      trailing={
        <GeneratePasswordButton
          fieldLabel={label}
          onUse={(pwd) => setValue("password", pwd, { shouldDirty: true, shouldValidate: true })}
        />
      }
      hint={
        password && (
          <div className="flex flex-col gap-1 text-xs">
            <PasswordStrengthMeter
              strength={strength}
              inline
              aside={<span className="tabular-nums">{password.length} characters</span>}
            />
            {strength?.warning && <p className="text-muted-foreground">{strength.warning}</p>}
          </div>
        )
      }
    />
  );
}
