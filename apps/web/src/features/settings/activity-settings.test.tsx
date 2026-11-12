import { SessionContext, type SessionMode } from "@repo/client";
import type { SealedAccountEvent } from "@repo/schema";
import { type LocalProfile, secretsStore } from "@repo/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, within } from "@/test/render";
import ActivitySettings from "./ActivitySettings";

// Real hook; the store and the server are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
const trpc = vi.hoisted(() => ({ activity: { list: { query: vi.fn() } } }));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpc,
}));

const LINKED: LocalProfile = {
  profileId: "p-linked",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

const now = Date.now();
// The stubbed opener below reads the "sealed" name as the name.
const event = (
  id: number,
  {
    deviceName = "Firefox on macOS",
    ...over
  }: Partial<SealedAccountEvent> & {
    deviceName?: string | null;
  } = {},
): SealedAccountEvent => ({
  id,
  type: "login",
  sealedDeviceName: deviceName,
  deviceKeyVersion: deviceName === null ? null : 1,
  newDevice: false,
  createdAt: now,
  ...over,
});

function renderActivity(mode: SessionMode = "online") {
  const session = { mode } as ContextType<typeof SessionContext>;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>
        <ActivitySettings />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(secretsStore, "openAccountEventDeviceName").mockImplementation(async (s) => s);
  store.profile = LINKED;
  store.profiles = [profileEntry(LINKED)];
});

describe("ActivitySettings", () => {
  it("lists the events and loads older ones on demand", async () => {
    trpc.activity.list.query.mockImplementation(async ({ before }: { before?: number }) =>
      before === undefined
        ? {
            events: [
              event(3, { type: "login_failed", deviceName: null }),
              event(2, { newDevice: true, deviceName: "Safari on iOS" }),
            ],
            nextBefore: 2,
          }
        : { events: [event(1, { type: "password_changed" })], nextBefore: null },
    );
    renderActivity();

    const list = await screen.findByRole("list", { name: "Account activity" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((r) => r.textContent),
    ).toEqual([
      expect.stringContaining("Sign-in failed: wrong passwordUnknown device"),
      expect.stringContaining("Signed in on a new deviceSafari on iOS"),
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Show older activity" }));
    expect(await within(list).findByText("Password changed")).toBeInTheDocument();
    expect(trpc.activity.list.query).toHaveBeenLastCalledWith({ before: 2 });
    expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
  });

  it("asks to connect while offline and doesn't call the server", () => {
    renderActivity("offline");

    expect(screen.getByText(/Connect to your account/)).toBeInTheDocument();
    expect(trpc.activity.list.query).not.toHaveBeenCalled();
  });

  it("is hidden for a local vault", () => {
    store.profile = { profileId: "p-local", mode: "local", email: null, userId: null };
    renderActivity();

    expect(screen.queryByText("Account activity")).not.toBeInTheDocument();
  });
});
