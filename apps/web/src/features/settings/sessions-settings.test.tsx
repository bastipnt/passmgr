import { SessionContext, type SessionMode } from "@repo/client";
import type { SessionInfo } from "@repo/schema";
import type { LocalProfile } from "@repo/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import SessionsSettings from "./SessionsSettings";

// Real hook; the store and the server are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
const trpc = vi.hoisted(() => ({
  session: {
    list: { query: vi.fn() },
    revoke: { mutate: vi.fn(async () => ({ ok: true })) },
    revokeOthers: { mutate: vi.fn(async () => ({ revoked: 1 })) },
  },
}));
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
const SESSIONS: SessionInfo[] = [
  { id: "s-phone", deviceName: "Safari on iOS", createdAt: now, lastSeenAt: now, current: false },
  { id: "s-here", deviceName: "Firefox on macOS", createdAt: now, lastSeenAt: now, current: true },
  {
    id: "s-old",
    deviceName: null,
    createdAt: now,
    lastSeenAt: now - 2 * 3_600_000,
    current: false,
  },
];

function renderSessions(mode: SessionMode = "online") {
  const session = { mode } as ContextType<typeof SessionContext>;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>
        <SessionsSettings />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.profile = LINKED;
  store.profiles = [profileEntry(LINKED)];
  trpc.session.list.query.mockResolvedValue(SESSIONS);
});

describe("SessionsSettings", () => {
  it("lists the signed-in devices, this one first", async () => {
    renderSessions();

    const list = await screen.findByRole("list", { name: "Signed-in devices" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Firefox on macOS (this device)"),
      expect.stringContaining("Safari on iOS"),
      expect.stringContaining("Unknown device"),
    ]);
    expect(rows[2]).toHaveTextContent("Active 2 hours ago");
    // No sign-out for this device: that's the account's "Sign out".
    expect(within(rows[0]!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("signs one other device out after confirming", async () => {
    renderSessions();

    await userEvent.click(await screen.findByRole("button", { name: "Sign out Safari on iOS" }));
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(trpc.session.revoke.mutate).toHaveBeenCalledWith({ id: "s-phone" });
    await waitFor(() => expect(trpc.session.list.query).toHaveBeenCalledTimes(2));
  });

  it("signs every other device out after confirming", async () => {
    renderSessions();

    await userEvent.click(await screen.findByRole("button", { name: "Sign out other devices" }));
    await userEvent.click(await screen.findByRole("button", { name: "Sign out others" }));

    expect(trpc.session.revokeOthers.mutate).toHaveBeenCalledWith({});
  });

  it("asks to connect while offline and doesn't call the server", async () => {
    renderSessions("offline");

    expect(screen.getByText(/Connect to your account/)).toBeInTheDocument();
    expect(trpc.session.list.query).not.toHaveBeenCalled();
  });

  it("is hidden for a local vault", () => {
    store.profile = { profileId: "p-local", mode: "local", email: null, userId: null };
    renderSessions();

    expect(screen.queryByText("Signed-in devices")).not.toBeInTheDocument();
  });
});
