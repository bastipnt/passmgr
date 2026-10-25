import { ShortcutProvider } from "@repo/client";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen } from "@/test/render";
import MobileVault from "./MobileVault";
import RecordLayout from "./RecordLayout";

// Every lock entry point goes through `useLockVault` (it ends the server session);
// the hook itself is covered in lock-vault.test.ts.
const lockVault = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./lock-vault", () => ({ useLockVault: () => lockVault }));

const isMobile = vi.hoisted(() => ({ value: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => isMobile.value }));

// The shell's data-bound parts are out of scope here.
vi.mock("@repo/client/src/providers/SortedRecordsProvider", () => ({
  SortedRecordsProvider: ({ children }: { children: ReactNode }) => children,
  useSortedRecords: () => ({
    query: "",
    setQuery: () => {},
    vaultFilter: "all",
    sortedRecords: [],
    hasGroupLabels: false,
  }),
}));
vi.mock("./RecordList", () => ({ default: () => null }));
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: () => undefined }),
}));
vi.mock("./SyncStatusMenu", () => ({ SyncStatusMenu: () => null }));
vi.mock("./RecordSortMenu", () => ({ RecordSortMenu: () => null }));
vi.mock("./TagBar", () => ({ TagBar: () => null }));
vi.mock("./CategorySidebar", () => ({ CategorySidebar: () => null }));
vi.mock("./SidebarFooter", () => ({ SidebarFooter: () => null }));
vi.mock("./BackupReminder", () => ({ default: () => null }));
vi.mock("@/features/vaults", () => ({ VaultSwitcher: () => null }));

beforeEach(() => {
  lockVault.mockClear();
});

function renderShell(ui: ReactNode) {
  const location = memoryLocation({ path: "/" });
  renderWithProviders(
    <Router hook={location.hook}>
      <ShortcutProvider>{ui}</ShortcutProvider>
    </Router>,
  );
}

describe("lock entry points", () => {
  it("desktop: the lock button locks through useLockVault", async () => {
    isMobile.value = false;
    renderShell(<RecordLayout>content</RecordLayout>);

    await userEvent.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(lockVault).toHaveBeenCalledTimes(1);
  });

  it("desktop: the lock shortcut locks through useLockVault", async () => {
    isMobile.value = false;
    renderShell(<RecordLayout>content</RecordLayout>);

    await userEvent.keyboard("{Control>}l{/Control}");

    expect(lockVault).toHaveBeenCalledTimes(1);
  });

  it("phone: the bar's lock button locks through useLockVault", async () => {
    isMobile.value = true;
    renderShell(<MobileVault />);

    await userEvent.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(lockVault).toHaveBeenCalledTimes(1);
  });
});
