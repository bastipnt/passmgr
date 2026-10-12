import type { PassMonitor } from "@repo/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { renderWithProviders, screen } from "@/test/render";
import PassMonitorPage from "./PassMonitorPage";
import ReusedPasswordsPage from "./ReusedPasswordsPage";
import WeakPasswordsPage from "./WeakPasswordsPage";

const mocks = vi.hoisted(() => ({
  monitor: {} as PassMonitor,
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  usePassMonitor: () => mocks.monitor,
  useVaults: () => ({ getVault: () => undefined, hasSeveralVaults: false }),
}));

function login(recordId: string, title: string) {
  return {
    recordId,
    vaultId: "v-personal",
    type: "login",
    title,
    username: "jana",
    password: "hunter2",
    version: 1,
    clientUpdatedAt: "2026-10-11T00:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
    schemaVersion: 1,
  } as never;
}

const checking: PassMonitor = {
  weak: null,
  weakFailed: false,
  reused: null,
  duplicates: null,
  old: null,
};

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.monitor = checking;
});

describe("PassMonitorPage", () => {
  it("shows a spinner per category while checking, then the counts", () => {
    const { rerender } = renderWithProviders(<PassMonitorPage />);
    expect(screen.getByLabelText("Checking weak passwords")).toBeInTheDocument();

    const github = login("a", "GitHub");
    const figma = login("b", "Figma");
    mocks.monitor = {
      weak: [{ record: github, strength: { level: "weak", label: "Weak" } }],
      weakFailed: false,
      reused: [{ id: "a", records: [github, figma] }],
      duplicates: [],
      old: [],
    };
    rerender(<PassMonitorPage />);

    expect(screen.getByLabelText("1 Weak passwords")).toBeInTheDocument();
    expect(screen.getByLabelText("2 Reused passwords")).toBeInTheDocument();
    expect(screen.getByLabelText("0 Duplicates")).toBeInTheDocument();
  });

  it("says when the strength check couldn't run", () => {
    mocks.monitor = { ...checking, weakFailed: true };
    renderWithProviders(<WeakPasswordsPage />);

    expect(screen.getByText(/strength check couldn't load/)).toBeInTheDocument();
  });
});

describe("ReusedPasswordsPage", () => {
  it("groups the records without showing the shared password, each opening its record", () => {
    mocks.monitor = {
      ...checking,
      reused: [{ id: "a", records: [login("a", "GitHub"), login("b", "Figma")] }],
    };
    renderWithProviders(<ReusedPasswordsPage />);

    expect(screen.getByRole("heading", { name: "Used in 2 places" })).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      recordPaths.record("a"),
    );
  });

  it("says so when every password is unique", () => {
    mocks.monitor = { ...checking, reused: [] };
    renderWithProviders(<ReusedPasswordsPage />);

    expect(screen.getByText("Every password is unique.")).toBeInTheDocument();
  });
});
