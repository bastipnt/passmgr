import { passwordSchema } from "@repo/schema";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { LockIcon, ShieldIcon } from "lucide-react";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import z from "zod";
import { NewPasswordLabelAction, PasswordStrengthMeter } from "@/features/password-generation";

export const newVaultSchema = z
  .object({
    name: z.string().max(60),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type NewVaultValues = z.infer<typeof newVaultSchema>;

export const NEW_VAULT_DEFAULTS: NewVaultValues = { name: "", password: "", confirmPassword: "" };

export default function NewVaultFields({
  control,
  setValue,
}: {
  control: Control<NewVaultValues>;
  setValue: UseFormSetValue<NewVaultValues>;
}) {
  return (
    <>
      <ControlledInput
        control={control}
        name="name"
        label="Vault name"
        autoComplete="off"
        placeholder="e.g. Personal"
        labelAction={<span className="text-muted-foreground text-xs">Optional</span>}
        leadingIcon={<ShieldIcon />}
      />
      <ControlledPasswordInput
        control={control}
        name="password"
        label="Password"
        autoComplete="new-password"
        leadingIcon={<LockIcon />}
        labelAction={<NewPasswordLabelAction setValue={setValue} />}
        hint={<NewPasswordStrength control={control} />}
      />
      <ControlledPasswordInput
        control={control}
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        leadingIcon={<LockIcon />}
      />
    </>
  );
}

function NewPasswordStrength({ control }: { control: Control<NewVaultValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
