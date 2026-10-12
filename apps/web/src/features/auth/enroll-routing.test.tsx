import { SessionContext } from "@repo/client";
import { secretsStore } from "@repo/store";
import type { ContextType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { authPaths } from "@/app/route-paths";
import { createFakeStore } from "@/test/fake-store";
import { renderWithProviders, waitFor } from "@/test/render";
import AuthRoutes from "./routes";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/hooks/use-app-config", () => ({
  useAppConfig: () => ({ registrationEnabled: true, isLoading: false }),
}));

const unlocked = { vaultUnlocked: true } as ContextType<typeof SessionContext>;

function renderAuthRoutes() {
  const location = memoryLocation({ path: authPaths.login, record: true });
  renderWithProviders(
    <SessionContext.Provider value={unlocked}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <AuthRoutes />
      </Router>
    </SessionContext.Provider>,
  );
  return location;
}

beforeEach(() => {
  store.needsBiometricEnroll = true;
});

afterEach(() => secretsStore.clearPassword());

describe("biometric enrollment after an unlock", () => {
  it("offers it once the unlock kept the password", async () => {
    secretsStore.setPassword("hunter2hunter2");
    const location = renderAuthRoutes();
    await waitFor(() => expect(location.history.at(-1)).toBe(authPaths.enrollBiometric));
  });

  it("skips it when there is no password to enroll with", async () => {
    const location = renderAuthRoutes();
    await waitFor(() => expect(location.history.at(-1)).toBe("/"));
  });

  it("skips it when it isn't wanted", async () => {
    store.needsBiometricEnroll = false;
    secretsStore.setPassword("hunter2hunter2");
    const location = renderAuthRoutes();
    await waitFor(() => expect(location.history.at(-1)).toBe("/"));
  });
});
