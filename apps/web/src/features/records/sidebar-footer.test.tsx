import { passMonitorIssueCount, useBreachCheck, usePassMonitor } from "@repo/client";
// The real one: `@repo/client`'s is mocked for `SidebarFooter`.
import { usePassMonitorIssueCount } from "@repo/client/src/hooks/use-pass-monitor";
import type { DecryptedRecord } from "@repo/schema";
import type { BreachCheck } from "@repo/store";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { renderWithProviders, screen } from "@/test/render";
import { SidebarFooter } from "./SidebarFooter";

function login(recordId: string, password: string, fields: Record<string, unknown> = {}) {
  return {
    recordId,
    vaultId: "v1",
    type: "login",
    title: recordId,
    username: `${recordId}-user`,
    password,
    version: 1,
    clientUpdatedAt: "2026-10-20T00:00:00.000Z",
    created_at: null,
    firstCreatedAt: "2026-10-20T00:00:00.000Z",
    schemaVersion: 1,
    ...fields,
  } as DecryptedRecord;
}

const site = (...urls: string[]) => ({ websites: urls.map((value) => ({ value })) });

const records = [
  login("mail", "123456", site("https://mail.example.net")),
  login("shop", "Vq7#mZr2!pLx9@tK", site("https://shop.example.net")),
  login("forum", "Vq7#mZr2!pLx9@tK", site("https://forum.example.net")),
  login("bank", "Hj4$wQe8^nBv1&cY", {
    ...site("https://bank.example.net"),
    firstCreatedAt: "2020-01-01T00:00:00.000Z",
  }),
  login("intranet", "Zt6!kRp3*mWq8#dF", site("http://intranet.example.org")),
  login("github", "Lc5@yNs9%gHu2!eJ", site("https://github.com")),
];

const mocks = vi.hoisted(() => ({
  records: [] as DecryptedRecord[],
  vault: null as unknown as object,
  issueCount: null as number | null,
}));

vi.mock("@repo/client/src/providers/RecordsProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useRecordsContext: () => ({ records: mocks.records, ready: true, revision: 1 }),
}));

vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => ({ vault: mocks.vault }),
}));

function storedChecks(): BreachCheck[] {
  const checkedAt = new Date().toISOString();
  return records.map(({ recordId, version, clientUpdatedAt, vaultId }) => ({
    recordId,
    version,
    clientUpdatedAt,
    vaultId,
    count: recordId === "bank" ? 5 : 0,
    checkedAt,
  }));
}

function fakeVault() {
  return {
    isBreachCheckEnabled: vi.fn(async () => true),
    getBreachChecks: vi.fn(async () => storedChecks()),
    saveBreachChecks: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  mocks.records = records;
  mocks.vault = fakeVault();
});

describe("usePassMonitorIssueCount", () => {
  it("counts what the Pass Monitor shows, once it rated the passwords", async () => {
    const page = renderHook(() => ({ monitor: usePassMonitor(), breach: useBreachCheck() }));
    await waitFor(
      () => {
        const { monitor, breach } = page.result.current;
        expect(monitor.weak).not.toBeNull();
        expect(monitor.missingTwoFactor).not.toBeNull();
        expect(breach.breached).not.toBeNull();
      },
      { timeout: 10_000 },
    );
    const { monitor, breach } = page.result.current;
    expect(monitor.weak?.map((finding) => finding.record.recordId)).toEqual(["mail"]);
    expect(monitor.reused).toHaveLength(1);
    expect(monitor.old).toHaveLength(1);
    expect(monitor.insecure).toHaveLength(1);
    expect(monitor.missingTwoFactor?.map((finding) => finding.record.recordId)).toEqual(["github"]);
    expect(breach.breached).toHaveLength(1);
    const shown = passMonitorIssueCount({ ...monitor, breached: breach.breached });
    expect(shown).toBe(7);
    page.unmount();

    const badge = renderHook(() => usePassMonitorIssueCount());
    await waitFor(() => expect(badge.result.current).toBe(shown));
  });

  it("leaves out weak passwords nobody rated yet, and is unknown until loaded", async () => {
    const { result } = renderHook(() => usePassMonitorIssueCount());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(6));
  });

  it("counts no breaches while the check is off", async () => {
    const vault = fakeVault();
    vault.isBreachCheckEnabled.mockResolvedValue(false);
    mocks.vault = vault;
    const { result } = renderHook(() => usePassMonitorIssueCount());
    await waitFor(() => expect(result.current).toBe(5));
  });
});

vi.mock("@repo/client", async (importActual) => ({
  ...(await importActual<object>()),
  usePassMonitorIssueCount: () => mocks.issueCount,
}));
vi.mock("./SyncStatusCard", () => ({
  SyncStatusCard: ({ collapsed }: { collapsed?: boolean }) =>
    collapsed ? <button type="button">Account & sync, sync status</button> : null,
}));

describe("SidebarFooter", () => {
  const renderFooter = (collapsed = false) =>
    renderWithProviders(
      <Router hook={memoryLocation({ path: "/" }).hook}>
        <SidebarFooter collapsed={collapsed} />
      </Router>,
    );

  it("links the Pass Monitor with its issue count, Account & sync and Settings", () => {
    mocks.issueCount = 3;
    renderFooter();
    expect(screen.getByRole("link", { name: "Pass Monitor 3" })).toHaveAttribute(
      "href",
      passMonitorPaths.index,
    );
    expect(screen.getByRole("link", { name: "Account & sync" })).toHaveAttribute(
      "href",
      settingsPaths.account,
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      settingsPaths.index,
    );
  });

  it("shows no badge while nothing is known or nothing is wrong", () => {
    for (const count of [null, 0]) {
      mocks.issueCount = count;
      const { unmount } = renderFooter();
      expect(screen.getByRole("link", { name: "Pass Monitor" })).toBeInTheDocument();
      unmount();
    }
  });

  it("collapsed: icons keep their names, the Pass Monitor a dot, Account the sync status", () => {
    mocks.issueCount = 3;
    renderFooter(true);
    const passMonitor = screen.getByRole("link", { name: "Pass Monitor 3" });
    expect(passMonitor).toHaveTextContent(/^Pass Monitor$/);
    expect(passMonitor.querySelector(".bg-warning")).not.toBeNull();
    expect(screen.getByText("Pass Monitor")).toHaveClass("sr-only");
    expect(screen.queryByRole("link", { name: "Account & sync" })).toBeNull();
    expect(screen.getByRole("button", { name: "Account & sync, sync status" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});
