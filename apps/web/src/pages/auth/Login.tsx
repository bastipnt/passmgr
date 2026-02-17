import { Button } from "@components/Button";
import styles from "./Login.module.css";
import Input from "@components/Input";
import { cn, toBase64 } from "@repo/util";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPCClient } from "@utils/trpc";
import * as opaque from "@serenity-kit/opaque";
import { useContext, useState } from "react";
import { SessionContext } from "../../providers/SessionProvider";
import { genSalt } from "@repo/crypto";

export default function Login() {
  const trpc = useTRPCClient();
  const { login } = useContext(SessionContext);

  const [loginError, setLoginError] = useState(false);

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
    const { clientLoginState, startLoginRequest } = opaque.client.startLogin({
      password,
    });

    let loginResponse: string;

    try {
      ({ loginResponse } = await trpc.login.startLogin.mutate({
        email,
        startLoginRequest,
      }));
    } catch (error) {
      console.log(error);
      setLoginError(true);
      return;
    }

    const loginResult = opaque.client.finishLogin({
      clientLoginState,
      loginResponse,
      password,
    });

    if (!loginResult) {
      console.log("Login failed");
      setLoginError(true);
      return;
    }

    const { finishLoginRequest, sessionKey } = loginResult;

    console.log({ sessionKey });

    const authSalt = genSalt();
    console.log({ authSalt });

    let sessionId: string;

    try {
      ({ sessionId } = await trpc.login.finishLogin.mutate({
        email,
        finishLoginRequest,
        authSalt: toBase64(authSalt),
      }));
    } catch (error) {
      console.log(error);
      setLoginError(true);
      return;
    }

    login(sessionId, sessionKey, authSalt);
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
