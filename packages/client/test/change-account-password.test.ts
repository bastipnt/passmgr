import type { AccountKeyMaterial } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeAccountPassword,
  PasswordChangeFailedError,
  type PasswordChangeTRPCClient,
} from "../src/account/change-password";
import type { LoginSessionFn } from "../src/login";

// The OPAQUE and Argon2 steps are replaced: only the order of the server calls is under test.
const loginUser = vi.hoisted(() => vi.fn());
vi.mock("../src/login", async (importActual) => ({
  ...(await importActual<object>()),
  loginUser,
}));
vi.mock("../src/opaque", () => ({
  opaqueInputFor: async () => "input",
  registerOpaque: async (
    _input: string,
    _email: string,
    send: (request: string) => Promise<{ attemptId: string }>,
  ) => ({ reply: await send("request"), registrationRecord: "record" }),
}));
vi.mock("../src/account/rekey-password-keys", () => ({
  wrapAccountKeyForPassword: async () => ({ passwordWrap: "new" }),
}));

const ALICE = { email: "alice@example.com", userId: "u-alice" };
const material = { userKeyPair: { publicKey: "pk" } } as unknown as AccountKeyMaterial;

let calls: string[];
let trpc: PasswordChangeTRPCClient;

beforeEach(() => {
  secretsStore.lock();
  calls = [];
  loginUser.mockImplementation(async (_trpc, hold: LoginSessionFn) => {
    calls.push("login");
    await hold("s-fresh", new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
    return { userId: ALICE.userId };
  });
  const record =
    <T>(name: string, answer: T) =>
    async () => {
      calls.push(name);
      return answer;
    };
  trpc = {
    login: { logout: { mutate: record("logout", {}) } },
    user: {
      startPasswordChange: { mutate: record("startPasswordChange", { attemptId: "a-1" }) },
      finishPasswordChange: { mutate: record("finishPasswordChange", { ok: true }) },
    },
  } as unknown as PasswordChangeTRPCClient;
});

describe("changeAccountPassword", () => {
  it("runs beforeLogin before the fresh login, which ends the old session", async () => {
    const attach = vi.fn<LoginSessionFn>(async () => void calls.push("attach"));

    await changeAccountPassword(
      trpc,
      attach,
      ALICE,
      material,
      "current password",
      "a brand new password",
      undefined,
      async () => void calls.push("beforeLogin"),
    );

    expect(calls).toEqual([
      "beforeLogin",
      "login",
      "attach",
      "startPasswordChange",
      "finishPasswordChange",
    ]);
  });

  it("leaves no session attached when attaching the fresh one fails after the old one ended", async () => {
    await secretsStore.unlockSession(
      "s-old",
      new Uint8Array(32).fill(3),
      new Uint8Array(32).fill(4),
    );
    const attach = vi.fn<LoginSessionFn>(async () => {
      throw new Error("not attached");
    });

    await expect(
      changeAccountPassword(trpc, attach, ALICE, material, "current password", "new password"),
    ).rejects.not.toBeInstanceOf(PasswordChangeFailedError);

    expect(calls).toEqual(["login", "logout"]);
    expect(secretsStore.hasServerSession).toBe(false);
  });
});
