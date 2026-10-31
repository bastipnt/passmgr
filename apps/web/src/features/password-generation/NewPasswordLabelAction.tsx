import { PASSWORD_MIN_LENGTH } from "@repo/schema";
import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";
import { WandSparklesIcon } from "lucide-react";
import { useMemo } from "react";
import type { UseFormSetValue } from "react-hook-form";
import PasswordGenerator from "./PasswordGenerator";

/** Any form choosing a new master password. */
type NewPasswordFormValues = { password: string; confirmPassword: string };

type NewPasswordLabelActionProps<T extends NewPasswordFormValues> = {
  setValue: UseFormSetValue<T>;
};

/** The new password's label row: the minimum length and a generator that fills both fields. */
export default function NewPasswordLabelAction<T extends NewPasswordFormValues>(
  props: NewPasswordLabelActionProps<T>,
) {
  // react-hook-form's paths don't narrow through a generic (see `PasswordField`).
  const { setValue } = props as unknown as NewPasswordLabelActionProps<NewPasswordFormValues>;
  const handle = useMemo(() => createHandle(), []);

  const use = (password: string) => {
    const options = { shouldDirty: true, shouldValidate: true };
    setValue("password", password, options);
    setValue("confirmPassword", password, options);
  };

  return (
    <span className="flex items-baseline gap-3">
      <span className="text-muted-foreground text-xs">min. {PASSWORD_MIN_LENGTH} characters</span>
      <DialogTrigger
        handle={handle}
        render={
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 font-medium text-primary-text text-xs hover:underline"
          >
            <WandSparklesIcon className="size-3.5" aria-hidden />
            Generate
          </button>
        }
      />
      <PasswordGenerator
        handle={handle}
        mode="passphrase"
        onUse={use}
        note={
          <p className="text-muted-foreground text-sm">
            Nobody can look it up for you. Learn it by heart, or write it down and keep it with your
            emergency kit.
          </p>
        }
      />
    </span>
  );
}
