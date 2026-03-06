import { useForm } from "@repo/ui";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { fromBase64 } from "@repo/crypto";
import { secretsStore } from "@repo/client";
import { decryptWorkerService } from "@/utils/decrypt-worker-service";
import { argon2WorkerService } from "@/utils/argon2-worker-service";
import { isPrfSupported, enrollBiometric, authenticateBiometric } from "@/utils/webauthn";
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
import { useContext, useEffect, useRef, useState } from "react";
import { SessionContext } from "@repo/client";
import type { BiometricKeyMaterial, LocalStore, VaultKeyMaterial } from "@repo/store";
import { FingerprintIcon } from "lucide-react";

type UnlockProps = {
  vaultKeyMaterial: VaultKeyMaterial;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  localStore: LocalStore;
  onSwitchAccount: () => void;
  onRemoveVault: () => Promise<void>;
};

export default function Unlock({
  vaultKeyMaterial,
  biometricKeyMaterial,
  localStore,
  onSwitchAccount,
  onRemoveVault,
}: UnlockProps) {
  const { offlineUnlock, offlineUnlockWithVaultKey } = useContext(SessionContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Holds the pending unlock callback so we can defer the redirect until after enrollment
  const pendingUnlockRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!biometricKeyMaterial) {
      void isPrfSupported().then(setBiometricAvailable);
    }
  }, [biometricKeyMaterial]);

  const schema = z.object({
    password: z.string().min(8),
  });

  type FormValues = z.infer<typeof schema>;

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  const onBiometricUnlock = async () => {
    if (!biometricKeyMaterial) return;
    setLoading(true);
    setError(null);

    try {
      const vaultKey = await authenticateBiometric(biometricKeyMaterial);
      offlineUnlockWithVaultKey(vaultKey);
      decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
    } catch {
      setError("Biometric authentication failed");
      setLoading(false);
    }
  };

  const onSubmit = async ({ password }: FormValues) => {
    setLoading(true);
    setError(null);

    const params = JSON.parse(vaultKeyMaterial.passwordKekParams) as {
      t: number;
      m: number;
      p: number;
    };
    const salt = fromBase64(vaultKeyMaterial.passwordKekSalt);

    try {
      const passwordKek = await argon2WorkerService.derive(password, salt, params);

      const shouldPromptEnroll =
        biometricAvailable && !biometricKeyMaterial && !localStorage.getItem("biometric-dismissed");

      if (shouldPromptEnroll) {
        // Unlock the vault in secretsStore without setting sessionId (no redirect yet)
        secretsStore.unlockOffline(
          passwordKek,
          vaultKeyMaterial.encryptedVaultKey,
          vaultKeyMaterial.vaultKeyEncryptionNonce,
        );
        decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
        // Store a callback to complete the session unlock after enrollment
        pendingUnlockRef.current = () => {
          offlineUnlockWithVaultKey(secretsStore.exportVaultKeyForWorker());
        };
        setLoading(false);
        setShowEnrollPrompt(true);
      } else {
        offlineUnlock(
          passwordKek,
          vaultKeyMaterial.encryptedVaultKey,
          vaultKeyMaterial.vaultKeyEncryptionNonce,
        );
        decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
      }
    } catch {
      setError("Wrong password or corrupted data");
      setLoading(false);
    }
  };

  const completePendingUnlock = () => {
    pendingUnlockRef.current?.();
    pendingUnlockRef.current = null;
  };

  const onEnroll = async () => {
    setEnrolling(true);
    try {
      const vaultKey = secretsStore.exportVaultKeyForWorker();
      const material = await enrollBiometric(vaultKey);
      await localStore.setBiometricKeyMaterial(material);
      completePendingUnlock();
    } catch {
      setError("Biometric enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const onDismissEnroll = () => {
    localStorage.setItem("biometric-dismissed", "1");
    completePendingUnlock();
  };

  if (showEnrollPrompt) {
    return (
      <section className="w-xs max-w-full">
        <Card>
          <CardHeader>
            <CardTitle>Enable Biometric Unlock?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use fingerprint or Face ID to unlock your vault next time — no password needed.
            </p>
            {error && <FieldError errors={[{ message: error }]} />}
          </CardContent>
          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="button" variant="outline" onClick={onDismissEnroll} disabled={enrolling}>
              Skip
            </Button>
            <Button type="button" onClick={onEnroll} disabled={enrolling}>
              Enable
              {enrolling && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </section>
    );
  }

  return (
    <section className="w-xs max-w-full flex flex-col gap-4">
      {biometricKeyMaterial && (
        <Card>
          <CardHeader>
            <CardTitle>
              <FingerprintIcon className="size-12 mx-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Button type="button" className="w-full" onClick={onBiometricUnlock} disabled={loading}>
              Unlock with biometrics
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
            {error && <FieldError errors={[{ message: error }]} />}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Unlock vault</CardTitle>
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
            {!biometricKeyMaterial && error && <FieldError errors={[{ message: error }]} />}
          </CardContent>

          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="submit" disabled={loading}>
              Unlock
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* TODO: as dialog and also on unlock */}
      {confirmRemove ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              This will remove the local vault data from this device. Your account and server data
              are not affected. You can log in again with your credentials.
            </p>
          </CardContent>
          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onRemoveVault}>
              Remove vault
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Button
          type="button"
          variant="link"
          className="text-muted-foreground text-xs"
          onClick={() => setConfirmRemove(true)}
        >
          Remove vault from this device
        </Button>
      )}
    </section>
  );
}
