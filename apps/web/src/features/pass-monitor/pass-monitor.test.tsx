import type { BreachCheckState, PassMonitor } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { renderWithProviders, screen } from "@/test/render";
import BreachedPasswordsPage from "./BreachedPasswordsPage";
import PassMonitorPage from "./PassMonitorPage";
import ReusedPasswordsPage from "./ReusedPasswordsPage";
import WeakPasswordsPage from "./WeakPasswordsPage";

const mocks = vi.hoisted(() => ({
  monitor: {} as PassMonitor,
  breach: {} as BreachCheckState,
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  usePassMonitor: () => mocks.monitor,
  useBreachCheck: () => mocks.breach,
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

const breachOff: BreachCheckState = {
  enabled: false,
  setEnabled: vi.fn(async () => undefined),
  breached: null,
  checking: false,
  failed: false,
  offline: false,
  lastCheckedAt: null,
};

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.monitor = checking;
  mocks.breach = breachOff;
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

describe("BreachedPasswordsPage", () => {
  it("is off until turned on, and the overview says so", async () => {
    const { unmount } = renderWithProviders(<PassMonitorPage />);
    expect(screen.getByRole("link", { name: /Breached passwords/ })).toHaveTextContent("Off");
    unmount();

    renderWithProviders(<BreachedPasswordsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Turn on breach check" }));

    expect(mocks.breach.setEnabled).toHaveBeenCalledWith(true);
  });

  it("lists breached passwords with how often they were seen", () => {
    mocks.breach = {
      ...breachOff,
      enabled: true,
      breached: [{ record: login("a", "GitHub"), count: 1200 }],
      lastCheckedAt: new Date().toISOString(),
    };
    renderWithProviders(<BreachedPasswordsPage />);

    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveTextContent(
      "Seen 1,200 times in data breaches",
    );
    expect(screen.getByText(/Last checked just now/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Breach check" })).toBeChecked();
  });

  it("explains an offline device without stored results", () => {
    mocks.breach = { ...breachOff, enabled: true, offline: true };
    renderWithProviders(<BreachedPasswordsPage />);

    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
  });
});
