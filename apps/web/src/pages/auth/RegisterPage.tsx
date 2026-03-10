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
import { useState } from "react";

export default function RegisterPage() {
  const [_, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
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

  const onSubmit = async ({ password, email }: FormValues) => {
    setLoading(true);
    await registerNewUser(email, password);

    navigate("/login");
    setLoading(false);
  };

  return (
    <section className="w-xs max-w-full">
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
