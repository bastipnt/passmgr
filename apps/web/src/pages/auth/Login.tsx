import { Button } from "@repo/ui/Button";
import styles from "./Login.module.css";
import { Input } from "@repo/ui/input";
import { cn } from "@repo/util";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "@repo/client";

export default function Login() {
  const { loginUser, loginError } = useLogin();
  const userCredentialsSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
  });

  type FormValues = z.infer<typeof userCredentialsSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(userCredentialsSchema),
  });

  const onSubmit = async ({ password, email }: FormValues) => {
    await loginUser(email, password);
  };

  return (
    <section className={cn(styles.section, "space-y-md")}>
      <h1>Login</h1>

      <form onSubmit={handleSubmit(onSubmit)} className={cn(styles.form, "space-y-md")}>
        <Input label="Email" {...register("email")} error={errors.email?.message} />
        <Input label="Password" {...register("password")} error={errors.password?.message} />

        <Button type="submit">Login</Button>
      </form>

      {loginError && <p>Login error please try again</p>}
    </section>
  );
}
