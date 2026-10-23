import { deriveOpaquePassword } from "@repo/crypto";
import type { PendingRecovery } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { LoginThrottledError, LoginUnreachableError } from "../src/login";
import {
  finishPendingRecovery,
  RecoveryFailedError,
  type RecoveryTRPCClient,
} from "../src/recover";

const EMAIL = "alice@example.com";
const B64_32 = toBase64(new Uint8Array(32));

const pending: PendingRecovery = {
  recoveryAuthKey: B64_32,
  userKeys: {
    passwordKekParams: { t: 3, m: 65536, p: 1 },
    passwordKekSalt: B64_32,
    encryptedAccountKey: toBase64(new Uint8Array(48)),
    accountKeyEncryptionNonce: toBase64(new Uint8Array(24)),
    recoveryKekSalt: B64_32,
    recoveryVerifier: B64_32,
    encryptedAccountKeyRecovery: toBase64(new Uint8Array(48)),
    accountKeyEncryptionNonceRecovery: toBase64(new Uint8Array(24)),
  },
};

function serverError(code: string, httpStatus: number) {
  return new TRPCClientError(code, {
    result: { error: { message: code, code: -32001, data: { code, httpStatus } } },
  } as never);
}

function refusingStart(error: unknown): RecoveryTRPCClient {
  return {
    recovery: {
      startRecovery: {
        mutate: async () => {
          throw error;
        },
      },
      finishRecovery: { mutate: async () => undefined },
    },
  } as unknown as RecoveryTRPCClient;
}

describe("finishPendingRecovery", () => {
  it.each([
    ["a refused proof", serverError("UNAUTHORIZED", 401), RecoveryFailedError],
    ["throttling", serverError("TOO_MANY_REQUESTS", 429), LoginThrottledError],
    ["a failing server", serverError("INTERNAL_SERVER_ERROR", 500), LoginUnreachableError],
    ["no connection", new TRPCClientError("Failed to fetch"), LoginUnreachableError],
  ])("tells %s apart", async (_, error, expected) => {
    const opaquePassword = await deriveOpaquePassword("new password", EMAIL);

    await expect(
      finishPendingRecovery(refusingStart(error), EMAIL, opaquePassword, pending),
    ).rejects.toBeInstanceOf(expected);
  });
});
