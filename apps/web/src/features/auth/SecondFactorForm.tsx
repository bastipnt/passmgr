import { zodResolver } from "@hookform/resolvers/zod";
import type { SecondFactorRequest } from "@repo/client";
import { type SecondFactorFormValues, secondFactorFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";

type SecondFactorFormProps = {
  request: SecondFactorRequest;
  onSubmit: (code: string) => void;
  onCancel: () => void;
};

/**
 * The second login step of an account with two-factor on: the code from the
 * authenticator app, or one of the backup codes.
 */
export default function SecondFactorForm({ request, onSubmit, onCancel }: SecondFactorFormProps) {
  const { invalid, verifying } = request;
  const [backup, setBackup] = useState(false);
  const { handleSubmit, control, reset } = useForm<SecondFactorFormValues>({
    resolver: zodResolver(secondFactorFormSchema),
    defaultValues: { code: "" },
  });

  return (
    <form
      onSubmit={handleSubmit(({ code }) => {
        reset();
        onSubmit(code);
      })}
    >
      <FormLock locked={verifying}>
        <FieldGroup className="gap-5">
          <ControlledInput
            // A new field per mode: the browser's one-time-code autofill only on the TOTP one.
            key={backup ? "backup" : "totp"}
            control={control}
            name="code"
            label={backup ? "Backup code" : "Authentication code"}
            autoComplete={backup ? "off" : "one-time-code"}
            inputMode={backup ? "text" : "numeric"}
            placeholder={backup ? "xxxxx-xxxxx" : "123456"}
            leadingIcon={backup ? <KeyRoundIcon /> : <ShieldCheckIcon />}
            labelAction={
              <button
                type="button"
                className="text-muted-foreground text-sm underline-offset-4 hover:underline"
                onClick={() => {
                  reset();
                  setBackup(!backup);
                }}
              >
                {backup ? "Use the app's code" : "Use a backup code"}
              </button>
            }
          />
          {invalid && !verifying && (
            <FieldError variant="box">
              <strong className="font-semibold">That code didn&apos;t work.</strong>{" "}
              {backup
                ? "Each backup code works once."
                : "Each code works once: if you just used it, wait for the next one."}
            </FieldError>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={verifying}>
              {verifying && <Spinner data-icon="inline-start" />}
              Verify
            </Button>
          </div>
        </FieldGroup>
      </FormLock>
    </form>
  );
}
