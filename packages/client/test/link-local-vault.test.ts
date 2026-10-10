import {
  type AKEExportKeyPair,
  ExpectedAuthResult,
  getOpaqueConfig,
  KE1,
  KE3,
  OpaqueID,
  OpaqueServer,
  RegistrationRecord,
  RegistrationRequest,
} from "@cloudflare/opaque-ts";
import {
  createVault,
  getPasswordKekParams,
  rotateVaultKey,
  setPasswordKekParams,
  unwrapVaultKey,
  wipe,
} from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import {
  LinkAccountMismatchError,
  LinkRejectedError,
  type LinkTRPCClient,
  LinkUnavailableError,
  localVaultKeyring,
  registerLocalVault,
} from "../src/account/link-local-vault";
import { b64ToBytes, bytesToB64, SERVER_IDENTITY } from "../src/opaque";
import { RegistrationFinishFailedError, type RegistrationKeyring } from "../src/register";

type FinishInput = Parameters<LinkTRPCClient["register"]["finishRegistration"]["mutate"]>[0];

const PASSWORD = "correct horse battery staple";
const EMAIL = "alice@example.com";

/**
 * A fake `register` + `login` router backed by a real in-process OPAQUE
 * server. Like the real one, a second registration of an email changes nothing.
 */
async function fakeServer() {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const ake = await cfg.ake.generateAuthKeyPair();
  const keypair: AKEExportKeyPair = { private_key: ake.private_key, public_key: ake.public_key };
  const oprfSeed = Array.from(crypto.getRandomValues(new Uint8Array(cfg.hash.Nh)));
  const server = new OpaqueServer(cfg, oprfSeed, keypair, SERVER_IDENTITY);
  const accounts = new Map<string, FinishInput & { userId: string }>();
  const attempts = new Map<string, { email: string; expected: string }>();
  const finished: FinishInput[] = [];
  const state = { refuseFinish: false };

  const trpc = {
    register: {
      startRegistration: {
        mutate: async ({
          email,
          registrationRequest,
        }: FinishInput & { registrationRequest: string }) => {
          const req = RegistrationRequest.deserialize(cfg, b64ToBytes(registrationRequest));
          const resp = await server.registerInit(req, email);
          if (resp instanceof Error) throw resp;
          return { registrationResponse: bytesToB64(resp.serialize()) };
        },
      },
      finishRegistration: {
        mutate: async (input: FinishInput) => {
          if (state.refuseFinish) throw new Error("FORBIDDEN");
          finished.push(input);
          if (!accounts.has(input.email))
            accounts.set(input.email, { ...input, userId: crypto.randomUUID() });
        },
      },
    },
    login: {
      startLogin: {
        mutate: async ({
          email,
          startLoginRequest,
        }: {
          email: string;
          startLoginRequest: string;
        }) => {
          const account = accounts.get(email);
          if (!account) throw new Error("no such account (the real server fakes a KE2)");
          const ke1 = KE1.deserialize(cfg, b64ToBytes(startLoginRequest));
          const record = RegistrationRecord.deserialize(
            cfg,
            b64ToBytes(account.registrationRecord),
          );
          const init = await server.authInit(ke1, record, email, email);
          if (init instanceof Error) throw init;
          const attemptId = crypto.randomUUID();
          attempts.set(attemptId, { email, expected: bytesToB64(init.expected.serialize()) });
          return { loginResponse: bytesToB64(init.ke2.serialize()), attemptId };
        },
      },
      finishLogin: {
        mutate: async ({ attemptId, finishLoginRequest }: Record<string, string>) => {
          const attempt = attempts.get(attemptId!)!;
          const ke3 = KE3.deserialize(cfg, b64ToBytes(finishLoginRequest!));
          const expected = ExpectedAuthResult.deserialize(cfg, b64ToBytes(attempt.expected));
          if (server.authFinish(ke3, expected) instanceof Error) throw new Error("UNAUTHORIZED");
          const account = accounts.get(attempt.email)!;
          const { userKeys, personalVault, userKeyPair, vaults = [] } = account;
          const {
            recoveryKekSalt: _s,
            recoveryVerifier: _v,
            encryptedAccountKeyRecovery: _e,
            accountKeyEncryptionNonceRecovery: _n,
            ...userPasswordKeys
          } = userKeys;
          const vaultKeys: MemberVault[] = [
            { ...personalVault, kind: "personal", role: "owner" },
            ...vaults.map((v) => ({ ...v, kind: "shared" as const, role: "owner" as const })),
          ];
          return {
            sessionId: "s-1",
            userId: account.userId,
            userPasswordKeys,
            vaultKeys,
            userKeyPair,
          };
        },
      },
    },
  } as unknown as LinkTRPCClient;

  return { trpc, finished, accounts, state };
}

async function localKeyring(password = PASSWORD): Promise<RegistrationKeyring> {
  const local = await generateLocalVault(password);
  const work: MemberVault = {
    ...createVault(local.accountKey, { name: "Work" }),
    kind: "shared",
    role: "owner",
  };
  const keyring = localVaultKeyring(local.material, local.recovery, [...local.vaults, work]);
  wipe(local.accountKey);
  wipe(local.recoveryKey);
  return keyring;
}

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

describe("localVaultKeyring", () => {
  it("takes a rotated vault with its earlier keys as it is", async () => {
    const local = await generateLocalVault(PASSWORD);
    const vault = local.vaults[0]!;
    const { previousKey, ...next } = rotateVaultKey(
      local.accountKey,
      unwrapVaultKey(local.accountKey, vault),
      vault.vaultId,
      1,
      { name: "Personal" },
    );
    const rotated = [{ ...vault, ...next, previousKeys: [previousKey] }];

    const keyring = localVaultKeyring(local.material, local.recovery, rotated);

    expect(keyring.personalVault).toMatchObject({ keyVersion: 2, previousKeys: [previousKey] });
  });

  it("throws for a rotated vault missing an earlier key", async () => {
    const local = await generateLocalVault(PASSWORD);
    const rotated = local.vaults.map((v) => ({ ...v, keyVersion: 2 }));
    expect(() => localVaultKeyring(local.material, local.recovery, rotated)).toThrow(
      LinkUnavailableError,
    );
  });

  it("throws without a personal vault", async () => {
    const local = await generateLocalVault(PASSWORD);
    expect(() => localVaultKeyring(local.material, local.recovery, [])).toThrow(
      LinkUnavailableError,
    );
  });
});

describe("registerLocalVault", () => {
  it("registers the local keyring as it is and logs in to it, the session held back", async () => {
    const { trpc, finished } = await fakeServer();
    const keyring = await localKeyring();

    const { info, session } = await registerLocalVault(trpc, EMAIL, PASSWORD, keyring);

    // Nothing generated: the wraps, the verifier, the keypair and every vault go up unchanged.
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ email: EMAIL, ...keyring });
    expect(finished[0]!.vaults).toHaveLength(1);
    expect(info.userKeyPair.publicKey).toBe(keyring.userKeyPair.publicKey);
    expect(info.vaultKeys.map((v) => v.vaultId)).toEqual([
      keyring.personalVault.vaultId,
      keyring.vaults![0]!.vaultId,
    ]);
    expect(session[0]).toBe("s-1");
  });

  it("finishes an interrupted link: the account exists, the invite is spent, the login decides", async () => {
    const { trpc, state } = await fakeServer();
    const keyring = await localKeyring();
    await registerLocalVault(trpc, EMAIL, PASSWORD, keyring, "invite");

    state.refuseFinish = true;
    const { info } = await registerLocalVault(trpc, EMAIL, PASSWORD, keyring, "invite");

    expect(info.userKeyPair.publicKey).toBe(keyring.userKeyPair.publicKey);
  });

  it("refuses an email taken by another account with another password", async () => {
    const { trpc } = await fakeServer();
    const other = "someone else's password";
    await registerLocalVault(trpc, EMAIL, other, await localKeyring(other));

    await expect(registerLocalVault(trpc, EMAIL, PASSWORD, await localKeyring())).rejects.toThrow(
      LinkRejectedError,
    );
  });

  it("refuses an email taken by another account with the same password", async () => {
    const { trpc } = await fakeServer();
    await registerLocalVault(trpc, EMAIL, PASSWORD, await localKeyring());

    const mismatch = registerLocalVault(trpc, EMAIL, PASSWORD, await localKeyring());
    await expect(mismatch).rejects.toThrow(LinkAccountMismatchError);
    // Handed back to be ended, never attached.
    await expect(mismatch).rejects.toMatchObject({
      session: ["s-1", expect.any(String), expect.anything()],
    });
  });

  it("reports the registration's failure when there is no account to log in to", async () => {
    const { trpc, state, accounts } = await fakeServer();
    state.refuseFinish = true;

    await expect(registerLocalVault(trpc, EMAIL, PASSWORD, await localKeyring())).rejects.toThrow(
      RegistrationFinishFailedError,
    );
    expect(accounts.size).toBe(0);
  });
});
