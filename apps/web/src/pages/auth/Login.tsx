import { useForm } from "@repo/ui";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, secretsStore } from "@repo/client";
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
import Link from "@repo/ui/components/Link";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { useContext, useState } from "react";
import { SessionContext } from "@repo/client";

export default function Login() {
  const { loginUser, loginError } = useLogin();
  const { unlockVault } = useContext(SessionContext);
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
      .then((passwordKek) => {
        unlockVault(passwordKek);
        decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
      })
      .catch((err) => {
        console.error("Vault unlock failed:", err);
      });
  };

  return (
    <section className="w-xs max-w-full">
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
    </section>
  );
}
