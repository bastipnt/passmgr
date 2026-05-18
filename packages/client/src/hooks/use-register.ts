import { useState } from "react";
import { useTRPCClient } from "../util/trpc";
import {
  RegistrationFinishFailedError,
  RegistrationStartFailedError,
  registerNewUser as registerNewUserCore,
} from "../register";

export function useRegistration() {
  const trpc = useTRPCClient();
  const [registrationError, setRegistrationError] = useState(false);

  async function registerNewUser(email: string, password: string): Promise<Uint8Array | undefined> {
    try {
      return await registerNewUserCore(trpc, email, password);
    } catch (err) {
      if (
        err instanceof RegistrationStartFailedError ||
        err instanceof RegistrationFinishFailedError
      ) {
        setRegistrationError(true);
        return;
      }
      throw err;
    }
  }

  return { registerNewUser, registrationError };
}
