import {
  type AKEExportKeyPair,
  ExpectedAuthResult,
  getOpaqueConfig,
  KE1,
  KE3,
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
  RegistrationRecord,
  RegistrationResponse,
} from "@cloudflare/opaque-ts";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import { SECOND_FACTOR_EXPIRED, SECOND_FACTOR_INVALID } from "@repo/schema";
import { TRPCClientError } from "@trpc/client";
import { describe, expect, it, vi } from "vitest";
import { freshLogin, WrongPasswordError } from "../src/account/change-password";
import {
  LoginFinishFailedError,
  LoginThrottledError,
  type LoginTRPCClient,
  LoginUnreachableError,
  loginUser,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../src/login";
import { b64ToBytes, bytesToB64, SERVER_IDENTITY } from "../src/opaque";

const PASSWORD = "correct horse battery staple";
const EMAIL = "alice@example.com";
const CODE = "123456";
const USER_ID = "user-1";

function trpcError(code: string, httpStatus: number, message: string) {
  return new TRPCClientError(message, {
    result: { error: { message, code: -32001, data: { code, httpStatus } } },
  } as never);
}

const SUCCESS = {
  sessionId: "s-1",
  userId: USER_ID,
  userPasswordKeys: {
    passwordKekParams: { t: 1, m: 8, p: 1 },
    passwordKekSalt: "salt",
    encryptedAccountKey: "eak",
    accountKeyEncryptionNonce: "nonce",
  },
  vaultKeys: [],
  userKeyPair: {
    keyVersion: 1,
    publicKey: "pk",
    encryptedPrivateKey: "epk",
    privateKeyEncryptionNonce: "n",
  },
};

/**
 * A `login` router backed by a real in-process OPAQUE server, with one account.
 * `twoFactor`: finishLogin answers with a challenge, and `verifySecondFactor`
 * takes `CODE` (or answers with `verifyError`).
 */
async function fakeServer({ twoFactor = false } = {}) {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const ake = await cfg.ake.generateAuthKeyPair();
  const keypair: AKEExportKeyPair = { private_key: ake.private_key, public_key: ake.public_key };
  const oprfSeed = Array.from(crypto.getRandomValues(new Uint8Array(cfg.hash.Nh)));
  const server = new OpaqueServer(cfg, oprfSeed, keypair, SERVER_IDENTITY);

  const client = new OpaqueClient(cfg, opaqueKsf);
  const req = await client.registerInit(PASSWORD);
  if (req instanceof Error) throw req;
  const resp = await server.registerInit(req, EMAIL);
  if (resp instanceof Error) throw resp;
  const fin = await client.registerFinish(
    RegistrationResponse.deserialize(cfg, resp.serialize()),
    SERVER_IDENTITY,
    EMAIL,
  );
  if (fin instanceof Error) throw fin;
  const record = fin.record.serialize();

  const attempts = new Map<string, string>();
  const state: { startError?: Error; finishError?: Error; verifyError?: Error } = {};
  const verified: string[] = [];

  const trpc = {
    login: {
      startLogin: {
        mutate: async ({ startLoginRequest }: { startLoginRequest: string }) => {
          if (state.startError) throw state.startError;
          const ke1 = KE1.deserialize(cfg, b64ToBytes(startLoginRequest));
          const init = await server.authInit(
            ke1,
            RegistrationRecord.deserialize(cfg, record),
            EMAIL,
            EMAIL,
          );
          if (init instanceof Error) throw init;
          const attemptId = crypto.randomUUID();
          attempts.set(attemptId, bytesToB64(init.expected.serialize()));
          return { loginResponse: bytesToB64(init.ke2.serialize()), attemptId };
        },
      },
      finishLogin: {
        mutate: async ({ attemptId, finishLoginRequest }: Record<string, string>) => {
          if (state.finishError) throw state.finishError;
          const ke3 = KE3.deserialize(cfg, b64ToBytes(finishLoginRequest!));
          const expected = ExpectedAuthResult.deserialize(
            cfg,
            b64ToBytes(attempts.get(attemptId!)!),
          );
          if (server.authFinish(ke3, expected) instanceof Error) throw new Error("UNAUTHORIZED");
          if (twoFactor) return { secondFactorRequired: true, challengeId: crypto.randomUUID() };
          return SUCCESS;
        },
      },
      verifySecondFactor: {
        mutate: async ({ code }: { challengeId: string; code: string }) => {
          verified.push(code);
          if (state.verifyError) throw state.verifyError;
          if (code !== CODE) throw trpcError("UNAUTHORIZED", 401, SECOND_FACTOR_INVALID);
          return SUCCESS;
        },
      },
    },
  } as unknown as LoginTRPCClient;

  return { trpc, state, verified };
}

/** A prompt answering with `codes` in turn (null: cancel). */
function promptWith(...codes: (string | null)[]) {
  return vi.fn<SecondFactorPrompt>(async () => codes.shift() ?? null);
}

describe("loginUser — second factor", () => {
  it("without two-factor never prompts", async () => {
    const { trpc, verified } = await fakeServer();
    const prompt = promptWith(CODE);
    const session = vi.fn(async () => {});

    const info = await loginUser(trpc, session, EMAIL, PASSWORD, prompt);

    expect(info.userId).toBe(USER_ID);
    expect(prompt).not.toHaveBeenCalled();
    expect(verified).toEqual([]);
    expect(session).toHaveBeenCalledOnce();
  });

  it("asks for a code and finishes with it", async () => {
    const { trpc, verified } = await fakeServer({ twoFactor: true });
    const prompt = promptWith(CODE);
    const session = vi.fn(async () => {});

    const info = await loginUser(trpc, session, EMAIL, PASSWORD, prompt);

    expect(info.userId).toBe(USER_ID);
    expect(prompt).toHaveBeenCalledExactlyOnceWith({ invalid: false });
    expect(verified).toEqual([CODE]);
    expect(session).toHaveBeenCalledWith("s-1", expect.any(String), expect.any(Uint8Array));
  });

  it("asks again after a wrong code, telling the prompt it was wrong", async () => {
    const { trpc, verified } = await fakeServer({ twoFactor: true });
    const prompt = promptWith("000000", "111111", CODE);

    await loginUser(trpc, async () => {}, EMAIL, PASSWORD, prompt);

    expect(prompt.mock.calls.map(([state]) => state)).toEqual([
      { invalid: false },
      { invalid: true },
      { invalid: true },
    ]);
    expect(verified).toEqual(["000000", "111111", CODE]);
  });

  it("tells the prompt when the login is past the code step", async () => {
    const { trpc, state } = await fakeServer({ twoFactor: true });
    const passed = Object.assign(promptWith(CODE), { done: vi.fn() });
    await loginUser(trpc, async () => {}, EMAIL, PASSWORD, passed);
    expect(passed.done).toHaveBeenCalledOnce();

    state.verifyError = trpcError("UNAUTHORIZED", 401, SECOND_FACTOR_EXPIRED);
    const expired = Object.assign(promptWith(CODE), { done: vi.fn() });
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD, expired)).rejects.toThrow();
    expect(expired.done).toHaveBeenCalledOnce();
  });

  it("a closed prompt cancels the login without a session", async () => {
    const { trpc } = await fakeServer({ twoFactor: true });
    const session = vi.fn(async () => {});

    await expect(
      loginUser(trpc, session, EMAIL, PASSWORD, promptWith("000000", null)),
    ).rejects.toBeInstanceOf(SecondFactorCancelledError);
    expect(session).not.toHaveBeenCalled();
  });

  it("without a prompt, a challenged login is cancelled", async () => {
    const { trpc } = await fakeServer({ twoFactor: true });
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      SecondFactorCancelledError,
    );
  });

  it("an expired challenge ends the login", async () => {
    const { trpc, state } = await fakeServer({ twoFactor: true });
    state.verifyError = trpcError("UNAUTHORIZED", 401, SECOND_FACTOR_EXPIRED);
    const prompt = promptWith(CODE, CODE);

    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD, prompt)).rejects.toBeInstanceOf(
      SecondFactorExpiredError,
    );
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("a throttled code ends the login as throttled", async () => {
    const { trpc, state } = await fakeServer({ twoFactor: true });
    state.verifyError = trpcError("TOO_MANY_REQUESTS", 429, "too many");
    await expect(
      loginUser(trpc, async () => {}, EMAIL, PASSWORD, promptWith(CODE)),
    ).rejects.toBeInstanceOf(LoginThrottledError);
  });
});

describe("loginUser — request failures", () => {
  const networkError = () => new TRPCClientError("Failed to fetch");

  it.each([
    ["a network failure", networkError()],
    ["a server error", trpcError("INTERNAL_SERVER_ERROR", 500, "boom")],
    ["an unavailable server", trpcError("SERVICE_UNAVAILABLE", 503, "busy")],
  ])("%s at the start is unreachable, not a credentials error", async (_, err) => {
    const { trpc, state } = await fakeServer();
    state.startError = err;
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      LoginUnreachableError,
    );
  });

  it("the per-IP rate limit (no tRPC error body) is throttled, not unreachable", async () => {
    const { trpc, state } = await fakeServer();
    state.startError = new TRPCClientError("Too Many Requests", {
      meta: { response: new Response(null, { status: 429 }) },
    });
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      LoginThrottledError,
    );
  });

  it("a network failure at the finish is unreachable", async () => {
    const { trpc, state } = await fakeServer();
    state.finishError = networkError();
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      LoginUnreachableError,
    );
  });

  it("a refused finish is a credentials error", async () => {
    const { trpc, state } = await fakeServer();
    state.finishError = trpcError("UNAUTHORIZED", 401, "invalid user credentials");
    await expect(loginUser(trpc, async () => {}, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      LoginFinishFailedError,
    );
  });

  it("a network failure while verifying the code is unreachable", async () => {
    const { trpc, state } = await fakeServer({ twoFactor: true });
    state.verifyError = networkError();
    await expect(
      loginUser(trpc, async () => {}, EMAIL, PASSWORD, promptWith(CODE)),
    ).rejects.toBeInstanceOf(LoginUnreachableError);
  });
});

describe("freshLogin — second factor", () => {
  class Failed extends Error {}
  const account = { email: EMAIL, userId: USER_ID };

  it("passes the prompt on and attaches the session", async () => {
    const { trpc } = await fakeServer({ twoFactor: true });
    const attach = vi.fn(async () => {});
    const prompt = promptWith(CODE);

    await freshLogin(trpc, attach, account, PASSWORD, Failed, prompt);

    expect(prompt).toHaveBeenCalledOnce();
    expect(attach).toHaveBeenCalledOnce();
  });

  it("lets a cancel through as itself, not as the caller's failure", async () => {
    const { trpc } = await fakeServer({ twoFactor: true });
    await expect(
      freshLogin(trpc, async () => {}, account, PASSWORD, Failed, promptWith(null)),
    ).rejects.toBeInstanceOf(SecondFactorCancelledError);
  });

  it("a wrong password still fails before any prompt", async () => {
    const { trpc } = await fakeServer({ twoFactor: true });
    const prompt = promptWith(CODE);
    await expect(
      freshLogin(trpc, async () => {}, account, "wrong", Failed, prompt),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    expect(prompt).not.toHaveBeenCalled();
  });
});
