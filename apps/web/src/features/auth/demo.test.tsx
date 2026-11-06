import { SessionContext } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { authPaths } from "@/app/route-paths";
import { ImportDialog } from "@/features/import";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import LoginPage from "./LoginPage";
import AuthRoutes from "./routes";
import WelcomePage from "./WelcomePage";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/hooks/use-app-config", () => ({
  useAppConfig: () => ({ registrationEnabled: true, isLoading: false }),
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));
vi.mock("@/hooks/use-storage-persistent", () => ({ useStoragePersistent: vi.fn(() => true) }));
const demoVault = vi.hoisted(() => ({
  startDemo: vi.fn(async () => undefined),
  continueDemo: vi.fn(async () => true),
}));
vi.mock("@repo/client/src/hooks/use-demo-vault", async (importActual) => ({
  ...(await importActual<object>()),
  useDemoVault: () => demoVault,
}));

const DEMO: LocalProfile = { profileId: "p-demo", mode: "local", email: null, userId: null };
const locked = { vaultUnlocked: false } as ContextType<typeof SessionContext>;

function renderAt(path: string, ui = <AuthRoutes />) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <SessionContext.Provider value={locked}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        {ui}
      </Router>
    </SessionContext.Provider>,
  );
  return location;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_DEMO_MODE", "true");
  localStorage.clear();
  store.loaded = true;
  store.profiles = [];
  store.profile = null;
  store.accountKeyMaterial = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("demo mode", () => {
  it("the welcome offers only the demo, and starts it", async () => {
    renderAt(authPaths.welcome, <WelcomePage />);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryByText(/Import it/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Try the demo/ }));
    expect(demoVault.startDemo).toHaveBeenCalledTimes(1);
  });

  it("seven taps on the welcome bring the normal app back in this browser", async () => {
    renderAt(authPaths.welcome, <WelcomePage />);
    const card = screen.getByText(/Explore passmgr/);
    for (let i = 0; i < 7; i++) fireEvent.pointerDown(card);

    await waitFor(() =>
      expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
        authPaths.create,
        authPaths.accountLogin,
        authPaths.restore,
      ]),
    );
    expect(demoVault.startDemo).not.toHaveBeenCalled();
  });

  it.each([authPaths.create, authPaths.accountLogin, authPaths.restore, authPaths.recover])(
    "%s goes back to the welcome",
    async (path) => {
      const location = renderAt(path);
      await waitFor(() => expect(location.history.at(-1)).toBe(authPaths.welcome));
    },
  );

  it("the unlock of a demo vault continues it or starts over, without a password", async () => {
    store.profiles = [{ ...profileEntry(DEMO, "Demo vault"), demo: true }];
    store.profile = DEMO;
    store.accountKeyMaterial = {} as typeof store.accountKeyMaterial;
    renderAt(authPaths.login, <LoginPage />);

    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText(/Forgot password/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Continue demo/ }));
    expect(demoVault.continueDemo).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /Start a new demo/ }));
    expect(demoVault.startDemo).toHaveBeenCalledTimes(1);
  });

  it("the switch sheet adds no vault or account", async () => {
    store.profiles = [{ ...profileEntry(DEMO, "Demo vault"), demo: true }];
    store.profile = DEMO;
    store.accountKeyMaterial = {} as typeof store.accountKeyMaterial;
    renderAt(authPaths.login, <LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /Switch/ }));
    expect(await screen.findByRole("list", { name: "Vaults on this device" })).toBeTruthy();
    expect(screen.queryByText(/Create new vault/)).toBeNull();
    expect(screen.queryByText(/Log in to another account/)).toBeNull();
  });

  it("hides import inside the app", () => {
    renderAt(
      "/",
      <ImportDialog>
        <button type="button">Import</button>
      </ImportDialog>,
    );
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });
});
