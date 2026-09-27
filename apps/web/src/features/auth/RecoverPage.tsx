import { zodResolver } from "@hookform/resolvers/zod";
import { RECOVERY_ERROR_MESSAGES, useRecovery } from "@repo/client";
import { type RecoverFormValues, recoverFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import Link from "@repo/ui/components/Link";
import { Spinner } from "@repo/ui/components/Spinner";
import { useState } from "react";
import { useLocation } from "wouter";
import { authPaths } from "@/app/route-paths";
import RecoveryKeyDialog from "./RecoveryKeyDialog";

export default function RecoverPage() {
  const [_, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);
  const { recover, recoveryError } = useRecovery();

  const { handleSubmit, control } = useForm<RecoverFormValues>({
    resolver: zodResolver(recoverFormSchema),
    defaultValues: { email: "", recoveryKey: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ email, recoveryKey, password }: RecoverFormValues) => {
    setLoading(true);
    const key = await recover(email, recoveryKey, password);
    setLoading(false);
    if (key) setNewRecoveryKey(key);
  };

  return (
    <section className="w-xs max-w-full">
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        description="Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
        onDone={() => {
          setNewRecoveryKey(null);
          navigate(authPaths.login);
        }}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>
              Use the recovery key you saved when you signed up. You'll be signed out on all
              devices.
            </CardDescription>
            <CardAction>
              <Link href={authPaths.login} variant="link">
                Login
              </Link>
            </CardAction>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              <ControlledInput
                control={control}
                name="email"
                label="Email"
                autoComplete="username"
              />
              <ControlledInput
                control={control}
                name="recoveryKey"
                label="Recovery key"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <ControlledPasswordInput
                control={control}
                name="password"
                label="New password"
                autoComplete="new-password"
              />
              <ControlledPasswordInput
                control={control}
                name="confirmPassword"
                label="Confirm new password"
                autoComplete="new-password"
              />
            </FieldGroup>
            {recoveryError && (
              <FieldError errors={[{ message: RECOVERY_ERROR_MESSAGES[recoveryError] }]} />
            )}
          </CardContent>

          <CardFooter className="flex flex-row justify-end gap-4">
            <Button type="submit" disabled={loading}>
              Reset password
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
