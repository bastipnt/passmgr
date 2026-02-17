import { Button } from "@components/Button";
import Input from "@components/Input";
import { cn } from "@repo/util";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import * as opaque from "@serenity-kit/opaque";
import { useState } from "react";
import styles from "./Register.module.css";
import { useTRPCClient } from "@repo/client";

export default function Register() {
  const trpc = useTRPCClient();
  const [_, navigate] = useLocation();

  const [registrationError, setRegistrationError] = useState(false);

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
    const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
      password,
    });

    let registrationResponse: string;

    try {
      ({ registrationResponse } = await trpc.register.startRegistration.mutate({
        email,
        registrationRequest,
      }));
    } catch (error) {
      console.log(error);
      setRegistrationError(true);
      return;
    }

    const { registrationRecord } = opaque.client.finishRegistration({
      clientRegistrationState,
      registrationResponse,
      password,
    });

    try {
      await trpc.register.finishRegistration.mutate({
        email,
        registrationRecord,
      });
    } catch (error) {
      console.log(error);
      setRegistrationError(true);
      return;
    }

    navigate("/");
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
