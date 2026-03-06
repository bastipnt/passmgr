import { useForm } from "@repo/ui";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, secretsStore } from "@repo/client";
import { toBase64 } from "@repo/crypto";
import { decryptWorkerService } from "@/utils/decrypt-worker-service";
import { argon2WorkerService } from "@/utils/argon2-worker-service";
import { useLocalStore } from "@/store/store-provider";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import Link from "@repo/ui/components/Link";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { useContext, useState } from "react";
import { SessionContext } from "@repo/client";

type LoginProps = {
  storedEmail?: string;
  onBackToUnlock?: () => void;
};

export default function Login({ storedEmail, onBackToUnlock }: LoginProps) {
  const { loginUser, loginError } = useLogin();
  const { unlockVault } = useContext(SessionContext);
  const store = useLocalStore();
  const [loading, setLoading] = useState(false);

  const userCredentialsSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
  });

  type FormValues = z.infer<typeof userCredentialsSchema>;

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async ({ password, email }: FormValues) => {
    setLoading(true);
    const unlockInfo = await loginUser(email, password);

    if (!unlockInfo) {
      setLoading(false);
      return;
    }

    // Session is established — navigation happens optimistically via SessionContext.
    // Now derive vault key off the main thread.
    argon2WorkerService
      .derive(unlockInfo.password, unlockInfo.passwordKekSalt, unlockInfo.passwordKekParams)
      .then(async (passwordKek) => {
        unlockVault(passwordKek);
        decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());

        // Clear previous user's data if a different account logs in
        const previousEmail = store?.vaultKeyMaterial?.email;
        if (previousEmail && previousEmail !== email) {
          await store?.localStore.clear();
        }

        // Persist encrypted vault key material for offline unlock
        const { encryptedVaultKey, vaultKeyEncryptionNonce } =
          secretsStore.getEncryptedVaultKeyMaterial();
        void store?.localStore.setVaultKeyMaterial({
          encryptedVaultKey,
          vaultKeyEncryptionNonce,
          passwordKekSalt: toBase64(unlockInfo.passwordKekSalt),
          passwordKekParams: JSON.stringify(unlockInfo.passwordKekParams),
          email,
        });
      })
      .catch((err) => {
        console.error("Vault unlock failed:", err);
      });
  };

  return (
    <section className="w-xs max-w-full flex flex-col gap-3">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardAction>
              or
              <Link href="/register" variant="link">
                Sign Up
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

              <ControlledPasswordInput
                control={control}
                name="password"
                label="Password"
                autoComplete="current-password"
              />
            </FieldGroup>
            {loginError && <FieldError errors={[{ message: "Login error please try again" }]} />}
          </CardContent>

          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="submit" disabled={loading}>
              Login
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {storedEmail && onBackToUnlock && (
        <button
          type="button"
          onClick={onBackToUnlock}
          className="flex items-center gap-3 rounded-lg border p-3 text-sm text-left hover:bg-muted transition-colors"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {storedEmail.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="truncate font-medium">{storedEmail}</span>
            <span className="text-muted-foreground text-xs">Unlock existing vault</span>
          </span>
        </button>
      )}
    </section>
  );
}
