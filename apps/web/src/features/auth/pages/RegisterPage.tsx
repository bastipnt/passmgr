import { Button } from "@repo/ui/components/Button";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useRegistration } from "@repo/client";
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
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { useForm } from "@repo/ui";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { Spinner } from "@repo/ui/components/Spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { useMemo, useState } from "react";
import { toBase64, wipe } from "@repo/crypto";

export default function RegisterPage() {
  const [_, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);
  const { registerNewUser, registrationError } = useRegistration();

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

  const recoveryKeyB64 = useMemo(() => (recoveryKey ? toBase64(recoveryKey) : ""), [recoveryKey]);

  const onSubmit = async ({ password, email }: FormValues) => {
    setLoading(true);
    const key = await registerNewUser(email, password);
    setLoading(false);
    if (key) setRecoveryKey(key);
  };

  const onCopy = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKeyB64);
    setCopied(true);
  };

  const onConfirm = () => {
    if (recoveryKey) wipe(recoveryKey);
    setRecoveryKey(null);
    setCopied(false);
    navigate("/login");
  };

  return (
    <section className="w-xs max-w-full">
      <Dialog
        open={recoveryKey !== null}
        onOpenChange={(open) => {
          if (!open && copied) onConfirm();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Save your recovery key</DialogTitle>
            <DialogDescription>
              Store this key in a safe place. It is the only way to recover your vault if you forget
              your password. It is shown once and never sent to the server.
            </DialogDescription>
          </DialogHeader>
          <code className="bg-muted rounded p-2 break-all font-mono text-xs select-all">
            {recoveryKeyB64}
          </code>
          <DialogFooter>
            <Button variant="secondary" onClick={onCopy}>
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button onClick={onConfirm} disabled={!copied}>
              I saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardAction>
              or
              <Link href="/login" variant="link">
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
              <ControlledPasswordInput
                control={control}
                name="password"
                label="Password"
                autoComplete="new-password"
              />
            </FieldGroup>
            {registrationError && (
              <FieldError
                errors={[
                  { message: "Error when trying to register a new account please try again" },
                ]}
              />
            )}
          </CardContent>

          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="submit" disabled={loading}>
              Sign Up
              {loading && <Spinner data-icon="inline-start" />}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
