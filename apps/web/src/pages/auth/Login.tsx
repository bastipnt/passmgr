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
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";

export default function Login() {
  const { loginUser, loginError } = useLogin();
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
    await loginUser(email, password);
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
              <ControlledInput control={control} name="email" label="Email" />
              <ControlledInput control={control} name="password" label="Password" />
            </FieldGroup>
            {loginError && <FieldError errors={[{ message: "Login error please try again" }]} />}
          </CardContent>

          <CardFooter className="flex flex-row gap-4 justify-end">
            <Button type="submit">Login</Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
