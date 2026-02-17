import * as opaque from "@serenity-kit/opaque";
import { useTRPCClient } from "./util/trpc";
import { useState } from "react";

export function useRegistration() {
  const trpc = useTRPCClient();
  const [registrationError, setRegistrationError] = useState(false);

  async function registerNewUser(email: string, password: string) {
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
  }

  return { registerNewUser, registrationError };
}
