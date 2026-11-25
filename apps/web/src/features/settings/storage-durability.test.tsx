import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPersistentStorage } from "@/hooks/use-storage-durability";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen } from "@/test/render";
import StorageSettings from "./StorageSettings";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const LOCAL: LocalProfile = { profileId: "p-local", mode: "local", email: null, userId: null };
const LINKED: LocalProfile = {
  profileId: "p-linked",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

let persisted = false;
const storage = {
  persist: vi.fn(async () => {
    persisted = true;
    return true;
  }),
  persisted: vi.fn(async () => persisted),
  estimate: vi.fn(async () => ({ usage: 1_200_000, quota: 10_000_000_000 })),
};

beforeEach(() => {
  persisted = false;
  stubStorage(storage);
  store.profile = LOCAL;
  store.profiles = [profileEntry(LOCAL)];
  localStorage.clear();
});
afterEach(() => {
  stubStorage(undefined);
});

/** jsdom has no `navigator.storage`. */
function stubStorage(value: unknown) {
  Object.defineProperty(navigator, "storage", { value, configurable: true });
}

describe("requestPersistentStorage", () => {
  it("asks the browser and resolves its answer", async () => {
    expect(await requestPersistentStorage()).toBe(true);
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it("resolves null without the API", async () => {
    stubStorage(undefined);
    expect(await requestPersistentStorage()).toBeNull();
  });
});

describe("StorageSettings", () => {
  it("warns a local vault about eviction and asks again on request", async () => {
    renderWithProviders(<StorageSettings />);

    expect(await screen.findByText("Not persistent")).toBeInTheDocument();
    expect(screen.getByText("1.2MB used")).toBeInTheDocument();
    expect(screen.getByText("of 10GB the browser allows for this site")).toBeInTheDocument();
    expect(screen.getByText(/exists only in this browser/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep data" }));

    expect(storage.persist).toHaveBeenCalledOnce();
    expect(await screen.findByText("Persistent")).toBeInTheDocument();
    expect(screen.queryByText(/exists only in this browser/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep data" })).not.toBeInTheDocument();
  });

  it("doesn't warn a linked profile, which has the server copy", async () => {
    store.profile = LINKED;
    store.profiles = [profileEntry(LINKED)];
    renderWithProviders(<StorageSettings />);

    expect(await screen.findByText("Not persistent")).toBeInTheDocument();
    expect(screen.getByText(/Items already synced can be downloaded again/)).toBeInTheDocument();
    expect(screen.queryByText(/exists only in this browser/)).not.toBeInTheDocument();
  });

  it("says it's checking until the browser answers, then that it doesn't say", async () => {
    stubStorage(undefined);
    renderWithProviders(<StorageSettings />);

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(await screen.findByText(/doesn't say whether it keeps/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep data" })).not.toBeInTheDocument();
  });
});
