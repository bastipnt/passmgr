import * as opaque from "@serenity-kit/opaque";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "server";

export async function register(trpc: TRPCClient<AppRouter>, email: string, password: string) {
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
    throw error;
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
    throw error;
  }

  return registrationRecord;
}
