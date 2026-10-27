import { type FormFieldSpec, multilineSummary } from "@repo/client";
import { totpSecretFromUri } from "@repo/crypto";
import type { CustomField, RecordFormValues } from "@repo/schema";
import { ControlledBoxedInput } from "@repo/ui/components/form/ControlledBoxedInput";
import { ControlledBoxedSelect } from "@repo/ui/components/form/ControlledBoxedSelect";
import { ControlledBoxedToggle } from "@repo/ui/components/form/ControlledBoxedToggle";
import { ControlledCodeBlock } from "@repo/ui/components/form/ControlledCodeBlock";
import type { Control, UseFormSetValue } from "react-hook-form";
import { GeneratePasswordButton, PasswordField } from "@/features/password-generation";
import { CardExpiryField, CardNumberField } from "./card/CardFields";

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
  /** Phone width: a field's `shortLabel` shows in place of its label. */
  compact?: boolean;
};

const INPUT_TYPES = { email: "email", phone: "tel", numeric: "text", date: "date" } as const;

/** One input, by its kind; the card's and the key's need their own controls. */
export default function RecordFormField({ spec, control, setValue, compact }: FieldProps) {
  const name = spec.key;

  switch (spec.kind) {
    case "text":
    case "secret":
      return (
        <ControlledBoxedInput
          control={control}
          name={name}
          label={spec.label}
          visibleLabel={compact ? spec.shortLabel : undefined}
          type={spec.input ? INPUT_TYPES[spec.input] : "text"}
          inputMode={spec.input === "numeric" ? "numeric" : undefined}
          placeholder={spec.placeholder}
          autoComplete="off"
          spellCheck={false}
          mono={spec.mono}
          secret={spec.kind === "secret"}
          trailing={
            spec.generator && (
              <GeneratePasswordButton
                size="icon"
                fieldLabel={spec.label}
                onUse={(value) =>
                  setValue(name, value, { shouldDirty: true, shouldValidate: true })
                }
              />
            )
          }
        />
      );

    case "totp":
      return (
        <ControlledBoxedInput
          control={control}
          name={name}
          label={spec.label}
          placeholder={spec.placeholder}
          autoComplete="off"
          spellCheck={false}
          mono
          onPaste={(event) => {
            const secret = totpSecretFromUri(event.clipboardData.getData("text"));
            if (!secret) return;
            event.preventDefault();
            setValue(name, secret, { shouldDirty: true, shouldValidate: true });
          }}
        />
      );

    case "password":
      return <PasswordField control={control} setValue={setValue} label={spec.label} />;

    case "multiline":
    case "secretMultiline":
      return (
        <ControlledCodeBlock
          control={control}
          name={name}
          label={spec.label}
          secret={spec.kind === "secretMultiline"}
          autoComplete="off"
          spellCheck={false}
          summary={(value, masked) => multilineSummary(spec, value, masked)}
        />
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
      return (
        <ControlledBoxedSelect
          control={control}
          name={name}
          label={spec.label}
          options={spec.options ?? []}
        />
      );

    case "toggle":
      return (
        <ControlledBoxedToggle
          control={control}
          name={name}
          label={spec.label}
          description={spec.description}
        />
      );
  }
}
