import { useForm } from "@repo/ui";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "@repo/client";
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
import { useState } from "react";

export default function Login() {
  const { loginUser, loginError } = useLogin();
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
    await loginUser(email, password);
    setLoading(false);
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
