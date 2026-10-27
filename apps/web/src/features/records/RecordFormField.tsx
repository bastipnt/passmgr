import type { FormFieldSpec } from "@repo/client";
import type { CustomField, RecordFormValues } from "@repo/schema";
import { Field, FieldLabel } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Switch } from "@repo/ui/components/Switch";
import { cn } from "@repo/ui/lib/utils";
import { LockIcon, MailIcon, UserIcon } from "lucide-react";
import { useId } from "react";
import { type Control, Controller, type UseFormSetValue } from "react-hook-form";
import { PasswordField } from "@/features/password-generation";
import { CardExpiryField, CardNumberField } from "./card/CardFields";
import { SshFingerprintHint } from "./ssh/SshKeyActions";

/** Masks a text input until focused, without `type="password"` (no save-password prompt). */
const MASKED = "[-webkit-text-security:disc] focus:[-webkit-text-security:none]";

/**
 * One form for every shape: typed loosely by key, validated by the type's own
 * schema. The common fields keep their types for the shared inputs.
 */
export type AnyFormValues = Record<string, unknown> & {
  title: string;
  note?: string;
  password?: string;
  customFields?: CustomField[];
  tags?: string[];
  websites?: { value: string }[];
};

type FieldProps = {
  spec: FormFieldSpec;
  control: Control<AnyFormValues>;
  setValue: UseFormSetValue<AnyFormValues>;
};

const INPUT_TYPES = { email: "email", phone: "tel", numeric: "text", date: "date" } as const;

const TEXT_ICONS = { user: <UserIcon />, mail: <MailIcon /> } as const;

function SelectField({ spec, control }: FieldProps) {
  const id = useId();
  const options = spec.options ?? [];

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
          <Select
            items={options}
            value={(field.value as string | undefined) ?? null}
            onValueChange={(value) => field.onChange(value ?? undefined)}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

function ToggleField({ spec, control }: FieldProps) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field }) => (
        <Field orientation="horizontal" className="items-center justify-between">
          <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
          <Switch
            id={id}
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(checked)}
          />
        </Field>
      )}
    />
  );
}

/** One input, by its kind; the card's and the key's need their own controls. */
export default function RecordFormField(props: FieldProps) {
  const { spec, control, setValue } = props;
  const name = spec.key;

  switch (spec.kind) {
    case "text":
    case "secret":
      return (
        <ControlledInput
          control={control}
          name={name}
          label={spec.label}
          type={spec.input ? INPUT_TYPES[spec.input] : "text"}
          inputMode={spec.input === "numeric" ? "numeric" : undefined}
          placeholder={spec.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            (spec.mono || spec.kind === "secret") && "font-mono",
            spec.kind === "secret" && MASKED,
          )}
          leadingIcon={spec.kind === "secret" ? <LockIcon /> : spec.icon && TEXT_ICONS[spec.icon]}
        />
      );

    case "totp":
      return (
        <ControlledInput
          control={control}
          name={name}
          label={spec.label}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          leadingIcon={<LockIcon />}
        />
      );

    case "password":
      return <PasswordField control={control} setValue={setValue} />;

    case "multiline":
    case "secretMultiline":
      return (
        <div className="flex flex-col gap-2">
          <ControlledTextarea
            control={control}
            name={name}
            label={spec.label}
            autoComplete="off"
            spellCheck={false}
            rows={spec.kind === "secretMultiline" ? 6 : 3}
            className={cn("font-mono text-xs", spec.kind === "secretMultiline" && MASKED)}
          />
          {spec.key === "publicKey" && (
            <SshFingerprintHint
              control={control as unknown as Control<RecordFormValues<"ssh_key">>}
            />
          )}
        </div>
      );

    case "cardNumber":
      return (
        <CardNumberField
          control={control as unknown as Control<RecordFormValues<"card">>}
          setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"card">>}
          label={spec.label}
        />
      );

    case "cardExpiry":
      return (
        <CardExpiryField
          control={control as unknown as Control<RecordFormValues<"card">>}
          setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"card">>}
          label={spec.label}
        />
      );

    case "select":
      return <SelectField {...props} />;

    case "toggle":
      return <ToggleField {...props} />;
  }
}
