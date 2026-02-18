import { Button } from "@repo/ui/Button";
import { Input } from "@repo/ui/input";
import { cn } from "@repo/util";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import styles from "./Register.module.css";
import { useRegistration } from "@repo/client";

export default function Register() {
  const [_, navigate] = useLocation();
  const { registerNewUser, registrationError } = useRegistration();

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
    await registerNewUser(email, password);

    navigate("/login");
  };

  return (
    <section className={cn(styles.section, "space-y-md")}>
      <h1>Register</h1>

      <form onSubmit={handleSubmit(onSubmit)} className={cn(styles.form, "space-y-md")}>
        <Input label="Email" {...register("email")} error={errors.email?.message} />
        <Input label="Password" {...register("password")} error={errors.password?.message} />

        <Button type="submit">Create new account</Button>
      </form>

      {registrationError && <p>Login error please try again</p>}
    </section>
  );
}
