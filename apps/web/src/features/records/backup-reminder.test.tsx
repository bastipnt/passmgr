import { BACKUP_REMINDER_INTERVAL_MS } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import { toast } from "@repo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsPaths } from "@/app/route-paths";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { act, renderWithProviders, waitFor } from "@/test/render";
import BackupReminder from "./BackupReminder";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/ui", async (importActual) => ({
  ...(await importActual<object>()),
  toast: Object.assign(vi.fn(), { warning: vi.fn(), dismiss: vi.fn() }),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("wouter", async (importActual) => ({
  ...(await importActual<object>()),
  useLocation: () => ["/", navigate],
}));

const LOCAL: LocalProfile = { profileId: "p-local", mode: "local", email: null, userId: null };
const LINKED: LocalProfile = {
  profileId: "p-linked",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

beforeEach(() => {
  store.profile = LOCAL;
  store.profiles = [profileEntry(LOCAL)];
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

/** The options of the reminder toast shown. */
function shown() {
  const [, options] = vi.mocked(toast.warning).mock.calls[0] ?? [];
  return options as unknown as {
    id: string;
    action: { onClick: () => void };
    cancel: { onClick: () => void };
    onDismiss: () => void;
  };
}

describe("BackupReminder", () => {
  const due = new Date(Date.parse(profileEntry(LOCAL).createdAt) + BACKUP_REMINDER_INTERVAL_MS);

  beforeEach(() => vi.useFakeTimers({ now: due, toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("reminds a local vault once due, and 'Later' puts it off", async () => {
    const { rerender } = renderWithProviders(<BackupReminder />);

    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    expect(shown().id).toBe("backup-reminder");

    shown().cancel.onClick();
    rerender(<BackupReminder />);

    await waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith("backup-reminder"));
    expect(toast.warning).toHaveBeenCalledOnce();
  });

  it("links to the account settings", async () => {
    renderWithProviders(<BackupReminder />);
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    shown().action.onClick();

    expect(navigate).toHaveBeenCalledWith(settingsPaths.security);
  });

  it("stays quiet before the interval and for linked profiles", () => {
    vi.setSystemTime(new Date(due.getTime() - 1));
    renderWithProviders(<BackupReminder />);
    expect(toast.warning).not.toHaveBeenCalled();

    vi.setSystemTime(due);
    store.profile = LINKED;
    store.profiles = [profileEntry(LINKED)];
    renderWithProviders(<BackupReminder />);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("puts it off when swiped away, but not when the vault is left", async () => {
    const { unmount } = renderWithProviders(<BackupReminder />);
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());

    unmount();
    shown().onDismiss(); // what sonner does for `toast.dismiss`
    renderWithProviders(<BackupReminder />);
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(2));

    act(() => vi.mocked(toast.warning).mock.calls[1]?.[1]?.onDismiss?.({} as never));
    expect(localStorage.getItem(`backup-reminder-snoozed:${LOCAL.profileId}`)).toBe(
      JSON.stringify(due.toISOString()),
    );
  });

  it("comes due while the vault stays open, once the page is visible again", async () => {
    vi.setSystemTime(new Date(due.getTime() - 1));
    renderWithProviders(<BackupReminder />);
    expect(toast.warning).not.toHaveBeenCalled();

    vi.setSystemTime(due);
    void act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
  });
});
