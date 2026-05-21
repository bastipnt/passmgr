import {
  KE2,
  OpaqueClient,
  OpaqueID,
  RegistrationResponse,
  getOpaqueConfig,
} from "@cloudflare/opaque-ts";
import { fromBase64, toBase64 } from "@repo/util";

const config = getOpaqueConfig(OpaqueID.OPAQUE_P256);
const SERVER_IDENTITY = "passmgr";

function bytesToB64(bytes: number[]): string {
  return toBase64(Uint8Array.from(bytes));
}

function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}

export type StartedRegistration = {
  registrationRequest: string;
  finish: (registrationResponse: string, email: string) => Promise<{ registrationRecord: string }>;
};

export async function clientStartRegistration(password: string): Promise<StartedRegistration> {
  const client = new OpaqueClient(config);
  const req = await client.registerInit(password);
  if (req instanceof Error) throw req;

  return {
    registrationRequest: bytesToB64(req.serialize()),
    finish: async (registrationResponse, email) => {
      const resp = RegistrationResponse.deserialize(config, b64ToBytes(registrationResponse));
      const finished = await client.registerFinish(resp, SERVER_IDENTITY, email);
      if (finished instanceof Error) throw finished;
      return { registrationRecord: bytesToB64(finished.record.serialize()) };
    },
  };
}

export type StartedLogin = {
  startLoginRequest: string;
  finish: (
    loginResponse: string,
    email: string,
  ) => Promise<{ finishLoginRequest: string; sessionKey: string } | null>;
};

export async function clientStartLogin(password: string): Promise<StartedLogin> {
  const client = new OpaqueClient(config);
  const ke1 = await client.authInit(password);
  if (ke1 instanceof Error) throw ke1;

  return {
    startLoginRequest: bytesToB64(ke1.serialize()),
    finish: async (loginResponse, email) => {
      const ke2 = KE2.deserialize(config, b64ToBytes(loginResponse));
      const finished = await client.authFinish(ke2, SERVER_IDENTITY, email);
      // Wrong-password failures may be client-detected here — surface as null so
      // callers can treat client- and server-side rejection symmetrically.
      if (finished instanceof Error) return null;
      const { ke3, session_key } = finished;
      return {
        finishLoginRequest: bytesToB64(ke3.serialize()),
        sessionKey: bytesToB64(session_key),
      };
    },
  };
}
