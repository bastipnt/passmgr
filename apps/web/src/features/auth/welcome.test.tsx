import type { LocalProfile } from "@repo/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { authPaths } from "@/app/route-paths";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import WelcomePage from "./WelcomePage";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const LOCAL: LocalProfile = { profileId: "p-local", mode: "local", email: null, userId: null };

function renderWelcome(path: string = authPaths.welcome) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <WelcomePage />
    </Router>,
  );
  return location;
}

beforeEach(() => {
  store.loaded = true;
  store.profiles = [];
});

describe("WelcomePage", () => {
  it("offers a new vault, logging in or restoring a backup", () => {
    renderWelcome();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual([authPaths.createLocal, authPaths.login, authPaths.restore]);
  });

  it("an invite leads the new vault to the account form", () => {
    renderWelcome(`${authPaths.welcome}?invite=abc`);
    expect(screen.getByRole("link", { name: /Create a new vault/ }).getAttribute("href")).toBe(
      `${authPaths.register}?invite=abc`,
    );
  });

  it("a device with a vault goes to its unlock", async () => {
    store.profiles = [profileEntry(LOCAL)];
    const location = renderWelcome();
    await waitFor(() => expect(location.history.at(-1)).toBe(authPaths.login));
  });
});
