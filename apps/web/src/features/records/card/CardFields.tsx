import {
  CARD_BRAND_LABELS,
  cardDigits,
  caretAfterDigits,
  detectCardBrand,
  formatCardExpiry,
  formatCardNumber,
  isLuhnValid,
} from "@repo/client";
import type { RecordFormValues } from "@repo/schema";
import { ControlledBoxedInput } from "@repo/ui/components/form/ControlledBoxedInput";
import { TriangleAlertIcon } from "lucide-react";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";

type CardFormValues = RecordFormValues<"card">;

type CardFieldProps = {
  control: Control<CardFormValues>;
  setValue: UseFormSetValue<CardFormValues>;
  label: string;
};

/** Shortest card number: below it the checksum says nothing yet. */
const MIN_CARD_DIGITS = 12;

// TODO: move to ui and share logic with mobile

/**
 * The number grouped as printed on the card while typing; the record stores
 * the digits (`recordFromForm`). The detected network sits next to the label; a hint below
 * flags a failed checksum: almost always a typo, but still saved as typed.
 */
export function CardNumberField({ control, setValue, label }: CardFieldProps) {
  const number = useWatch({ control, name: "number" }) ?? "";
  const brand = detectCardBrand(number);
  const digits = cardDigits(number);
  const checksumFails = digits.length >= MIN_CARD_DIGITS && !isLuhnValid(digits);

  return (
    <ControlledBoxedInput
      control={control}
      name="number"
      label={label}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      secret
      labelSuffix={
        brand && (
          <span className="ml-1.5 rounded bg-primary/10 px-1 py-px font-bold text-[0.625rem] text-primary-text uppercase italic tracking-wide">
            {CARD_BRAND_LABELS[brand]}
          </span>
        )
      }
      value={formatCardNumber(number)}
      onChange={(event) => {
        const input = event.target;
        const caret = input.selectionStart ?? input.value.length;
        const digitsBeforeCaret = cardDigits(input.value.slice(0, caret)).length;
        const formatted = formatCardNumber(input.value);
        setValue("number", formatted, { shouldDirty: true });
        // Regrouping moves the text under the caret; put it back after the
        // same digit, once React has written the new value.
        if (formatted !== input.value && caret < input.value.length) {
          requestAnimationFrame(() => {
            const position = caretAfterDigits(formatted, digitsBeforeCaret);
            input.setSelectionRange(position, position);
          });
        }
      }}
      hint={
        checksumFails && (
          <p className="flex items-center gap-1.5 text-amber-700 text-xs dark:text-[#ffb23f]">
            <TriangleAlertIcon className="size-3.5" aria-hidden />
            This number doesn&apos;t look right. Check it for a typo.
          </p>
        )
      }
    />
  );
}

/** "MM/YY", the slash typed for you. */
export function CardExpiryField({ control, setValue, label }: CardFieldProps) {
  const expiry = useWatch({ control, name: "expiry" }) ?? "";

  return (
    <ControlledBoxedInput
      control={control}
      name="expiry"
      label={label}
      inputMode="numeric"
      autoComplete="off"
      placeholder="MM/YY"
      maxLength={5}
      mono
      onChange={(event) =>
        setValue("expiry", formatCardExpiry(event.target.value, expiry), {
          shouldDirty: true,
          shouldValidate: expiry.length >= 5,
        })
      }
    />
  );
}
