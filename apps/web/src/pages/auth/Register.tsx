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

export default function Register() {
  const [_, navigate] = useLocation();
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
    await registerNewUser(email, password);

    navigate("/login");
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
              <ControlledInput control={control} name="email" label="Email" />
              <ControlledInput control={control} name="password" label="Password" />
            </FieldGroup>
            {registrationError && (
              <FieldError
                errors={[
                  { message: "Error when trying to register a new account please try again" },
                ]}
              />
            )}
          </CardContent>

          <CardFooter>
            <Button type="submit">Sign Up</Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
