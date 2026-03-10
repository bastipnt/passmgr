import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import Link from "@repo/ui/components/Link";
import { Spinner } from "@repo/ui/components/Spinner";
import { useEffect } from "react";
import z from "zod";

const userCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginFormValues = z.infer<typeof userCredentialsSchema>;

type LoginFormProps = {
  onSubmit: (formValues: LoginFormValues) => Promise<void>;
  storedEmail?: string;
  loginError: boolean;
  unlockError: boolean;
  loading: boolean;
};

export default function LoginForm({
  storedEmail = "",
  onSubmit,
  loginError,
  unlockError,
  loading,
}: LoginFormProps) {
  const { handleSubmit, control, setValue } = useForm<LoginFormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: {
      email: storedEmail,
      password: "",
    },
  });

  useEffect(() => {
    setValue("email", storedEmail ?? "");
  }, [storedEmail, setValue]);

  return (
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
              disabled={!!storedEmail}
            />

            <ControlledPasswordInput
              control={control}
              name="password"
              label="Password"
              autoComplete="current-password"
            />
          </FieldGroup>
          {(loginError || unlockError) && (
            <FieldError errors={[{ message: "Login error please try again" }]} />
          )}
        </CardContent>

        <CardFooter className="flex flex-row gap-4 justify-end">
          <Button type="submit" disabled={loading}>
            Login
            {loading && <Spinner data-icon="inline-start" />}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
