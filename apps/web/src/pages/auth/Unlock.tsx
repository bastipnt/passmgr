import { useForm } from "@repo/ui";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { fromBase64 } from "@repo/crypto";
import { secretsStore } from "@repo/client";
import { decryptWorkerService } from "@/utils/decrypt-worker-service";
import { argon2WorkerService } from "@/utils/argon2-worker-service";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { Input } from "@repo/ui/components/Input";
import { Spinner } from "@repo/ui/components/Spinner";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { useContext, useState } from "react";
import { SessionContext } from "@repo/client";
import type { VaultKeyMaterial } from "@repo/store";

type UnlockProps = {
  vaultKeyMaterial: VaultKeyMaterial;
  onSwitchAccount: () => void;
};

export default function Unlock({ vaultKeyMaterial, onSwitchAccount }: UnlockProps) {
  const { offlineUnlock } = useContext(SessionContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const schema = z.object({
    password: z.string().min(8),
  });

  type FormValues = z.infer<typeof schema>;

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  const onSubmit = async ({ password }: FormValues) => {
    setLoading(true);
    setError(false);

    const params = JSON.parse(vaultKeyMaterial.passwordKekParams) as {
      t: number;
      m: number;
      p: number;
    };
    const salt = fromBase64(vaultKeyMaterial.passwordKekSalt);

    try {
      const passwordKek = await argon2WorkerService.derive(password, salt, params);
      offlineUnlock(
        passwordKek,
        vaultKeyMaterial.encryptedVaultKey,
        vaultKeyMaterial.vaultKeyEncryptionNonce,
      );
      decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <section className="w-xs max-w-full">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Unlock</CardTitle>
            <CardAction>
              <Button type="button" variant="link" onClick={onSwitchAccount}>
                Switch account
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input value={vaultKeyMaterial.email} disabled />
              </Field>

              <ControlledPasswordInput
                control={control}
                name="password"
                label="Password"
                autoComplete="current-password"
              />
            </FieldGroup>
            {error && <FieldError errors={[{ message: "Wrong password or corrupted data" }]} />}
          </CardContent>

          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="submit" disabled={loading}>
              Unlock
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
