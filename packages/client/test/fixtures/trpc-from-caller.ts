import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "@repo/types";
import type { RegistrationTRPCClient } from "../../src/register";
import type { LoginTRPCClient } from "../../src/login";

type RouterIn = inferRouterInputs<AppRouter>;
type RouterOut = inferRouterOutputs<AppRouter>;

export type AuthTRPCClient = Pick<TRPCClient<AppRouter>, "register" | "login">;

export type AuthCaller = {
  register: {
    startRegistration: (
      input: RouterIn["register"]["startRegistration"],
    ) => Promise<RouterOut["register"]["startRegistration"]>;
    finishRegistration: (input: RouterIn["register"]["finishRegistration"]) => Promise<void>;
  };
  login: {
    startLogin: (
      input: RouterIn["login"]["startLogin"],
    ) => Promise<RouterOut["login"]["startLogin"]>;
    finishLogin: (
      input: RouterIn["login"]["finishLogin"],
    ) => Promise<RouterOut["login"]["finishLogin"]>;
  };
};

/**
 * Shape adapter: wraps a tRPC server-side caller (direct procedure calls) into
 * the `.mutate(input)` shape expected by client code (Pick<TRPCClient<AppRouter>>).
 */
export function callerToTrpc(caller: AuthCaller): AuthTRPCClient {
  return {
    register: {
      startRegistration: { mutate: (input) => caller.register.startRegistration(input) },
      // tRPC infers void-returning mutation output as `never`; cast at the boundary.
      finishRegistration: {
        mutate: async (input) => {
          await caller.register.finishRegistration(input);
          return undefined as never;
        },
      },
    } as RegistrationTRPCClient["register"],
    login: {
      startLogin: { mutate: (input) => caller.login.startLogin(input) },
      finishLogin: { mutate: (input) => caller.login.finishLogin(input) },
    } as LoginTRPCClient["login"],
  };
}

export type Captured = {
  register: {
    startInputs: Array<RouterIn["register"]["startRegistration"]>;
    finishInputs: Array<RouterIn["register"]["finishRegistration"]>;
  };
  login: {
    startInputs: Array<RouterIn["login"]["startLogin"]>;
    finishInputs: Array<RouterIn["login"]["finishLogin"]>;
  };
};

/**
 * Wrap an AuthTRPCClient so every `.mutate(input)` call records its input into
 * `captured` before delegating. Used for client-side secret-hygiene assertions
 * ("recoveryKey never sent on the wire").
 */
export function withCapture(trpc: AuthTRPCClient): { trpc: AuthTRPCClient; captured: Captured } {
  const captured: Captured = {
    register: { startInputs: [], finishInputs: [] },
    login: { startInputs: [], finishInputs: [] },
  };

  const wrapped: AuthTRPCClient = {
    register: {
      startRegistration: {
        mutate: (input) => {
          captured.register.startInputs.push(input);
          return trpc.register.startRegistration.mutate(input);
        },
      },
      finishRegistration: {
        mutate: async (input) => {
          captured.register.finishInputs.push(input);
          await trpc.register.finishRegistration.mutate(input);
          return undefined as never;
        },
      },
    } as RegistrationTRPCClient["register"],
    login: {
      startLogin: {
        mutate: (input) => {
          captured.login.startInputs.push(input);
          return trpc.login.startLogin.mutate(input);
        },
      },
      finishLogin: {
        mutate: (input) => {
          captured.login.finishInputs.push(input);
          return trpc.login.finishLogin.mutate(input);
        },
      },
    } as LoginTRPCClient["login"],
  };

  return { trpc: wrapped, captured };
}

export type ProcedurePath =
  | "register.startRegistration"
  | "register.finishRegistration"
  | "login.startLogin"
  | "login.finishLogin";

/**
 * Wrap an AuthTRPCClient so a single procedure's `.mutate` throws the given error.
 * All other procedures still hit the underlying (real) trpc — important for
 * failure-path tests that need earlier steps (e.g. startRegistration) to succeed
 * against the real server before the targeted procedure fails.
 */
export function withThrow(
  trpc: AuthTRPCClient,
  opts: { path: ProcedurePath; error: Error },
): AuthTRPCClient {
  const throwingMutate = { mutate: async () => Promise.reject(opts.error) };
  const wrap: AuthTRPCClient = {
    register: { ...trpc.register },
    login: { ...trpc.login },
  };

  switch (opts.path) {
    case "register.startRegistration":
      wrap.register = {
        ...trpc.register,
        startRegistration:
          throwingMutate as RegistrationTRPCClient["register"]["startRegistration"],
      };
      break;
    case "register.finishRegistration":
      wrap.register = {
        ...trpc.register,
        finishRegistration:
          throwingMutate as RegistrationTRPCClient["register"]["finishRegistration"],
      };
      break;
    case "login.startLogin":
      wrap.login = {
        ...trpc.login,
        startLogin: throwingMutate as LoginTRPCClient["login"]["startLogin"],
      };
      break;
    case "login.finishLogin":
      wrap.login = {
        ...trpc.login,
        finishLogin: throwingMutate as LoginTRPCClient["login"]["finishLogin"],
      };
      break;
  }

  return wrap;
}
