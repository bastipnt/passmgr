import {
  type AKEExportKeyPair,
  getOpaqueConfig,
  OpaqueID,
  OpaqueServer,
  RegistrationRequest,
} from "@cloudflare/opaque-ts";
import {
  getPasswordKekParams,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
} from "@repo/crypto";
import { fromBase64 } from "@repo/util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyring } from "../src/account/new-keyring";
import { b64ToBytes, bytesToB64, SERVER_IDENTITY } from "../src/opaque";
import {
  RegistrationStartFailedError,
  type RegistrationTRPCClient,
  registerNewUser,
} from "../src/register";

vi.mock("../src/account/new-keyring", async (importActual) => {
  const actual = await importActual<typeof import("../src/account/new-keyring")>();
  return { generateKeyring: vi.fn(actual.generateKeyring) };
});

type FinishInput = Parameters<
  RegistrationTRPCClient["register"]["finishRegistration"]["mutate"]
>[0];

const PASSWORD = "correct horse battery staple";
const EMAIL = "alice@example.com";

/** A fake `register` router backed by a real in-process OPAQUE server; records what finish got. */
async function fakeServer() {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const ake = await cfg.ake.generateAuthKeyPair();
  const keypair: AKEExportKeyPair = { private_key: ake.private_key, public_key: ake.public_key };
  const oprfSeed = Array.from(crypto.getRandomValues(new Uint8Array(cfg.hash.Nh)));
  const server = new OpaqueServer(cfg, oprfSeed, keypair, SERVER_IDENTITY);
  const finished: FinishInput[] = [];

  const trpc = {
    register: {
      startRegistration: {
        mutate: async ({
          email,
          registrationRequest,
        }: {
          email: string;
          registrationRequest: string;
        }) => {
          const req = RegistrationRequest.deserialize(cfg, b64ToBytes(registrationRequest));
          const resp = await server.registerInit(req, email);
          if (resp instanceof Error) throw resp;
          return { registrationResponse: bytesToB64(resp.serialize()) };
        },
      },
      finishRegistration: {
        mutate: async (input: FinishInput) => {
          finished.push(input);
        },
      },
    },
  } as unknown as RegistrationTRPCClient;

  return { trpc, finished };
}

describe("registerNewUser", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
  afterAll(() => setPasswordKekParams(previous));

  it("sends a keypair and a personal vault wrapped under the account key the password opens", async () => {
    const { trpc, finished } = await fakeServer();

    await registerNewUser(trpc, EMAIL, PASSWORD);

    const [input] = finished;
    if (!input) throw new Error("finishRegistration not called");
    const { userKeys, personalVault, userKeyPair } = input;

    const kek = await retrievePRK(
      PASSWORD,
      fromBase64(userKeys.passwordKekSalt),
      userKeys.passwordKekParams,
    );
    const accountKey = unwrapAccountKey(
      kek,
      userKeys.encryptedAccountKey,
      userKeys.accountKeyEncryptionNonce,
    );

    expect(userKeyPair.keyVersion).toBe(1);
    expect(unwrapUserPrivateKey(accountKey, userKeyPair)).toHaveLength(32);
    expect(unwrapVaultKey(accountKey, personalVault)).toHaveLength(32);
  });

  it("derives no keys when the server refuses the registration", async () => {
    const { trpc, finished } = await fakeServer();
    vi.mocked(generateKeyring).mockClear();
    trpc.register.startRegistration.mutate = async () => {
      throw new Error("FORBIDDEN");
    };

    await expect(registerNewUser(trpc, EMAIL, PASSWORD)).rejects.toThrow(
      RegistrationStartFailedError,
    );
    expect(generateKeyring).not.toHaveBeenCalled();
    expect(finished).toHaveLength(0);
  });

  it("creates a new keypair per registration", async () => {
    const { trpc, finished } = await fakeServer();

    await registerNewUser(trpc, EMAIL, PASSWORD);
    await registerNewUser(trpc, "bob@example.com", PASSWORD);

    expect(finished[0]!.userKeyPair.publicKey).not.toBe(finished[1]!.userKeyPair.publicKey);
  });
});
