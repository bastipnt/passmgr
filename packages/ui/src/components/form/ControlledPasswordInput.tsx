import {
  ControlledInput,
  type ControlledInputParams,
} from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { FieldValues } from "react-hook-form";

type ControlledPasswordInputParams<TFieldValues extends FieldValues = FieldValues> = Omit<
  ControlledInputParams<TFieldValues>,
  "type" | "addon"
>;

export function ControlledPasswordInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
  ...props
}: ControlledPasswordInputParams<TFieldValues>) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  function togglePasswordVisibility() {
    setPasswordVisible((currentVisibility) => !currentVisibility);
  }

  return (
    <ControlledInput
      {...props}
      ref={passwordRef}
      control={control}
      name={name}
      label={label}
      type={passwordVisible ? "text" : "password"}
      addon={
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={passwordVisible ? "Hide Password" : "Show password"}
            title={passwordVisible ? "Hide Password" : "Show password"}
            size="icon-xs"
            onClick={togglePasswordVisibility}
          >
            {passwordVisible ? <EyeIcon /> : <EyeOffIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      }
    />
  );
}
