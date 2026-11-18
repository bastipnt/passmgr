import type { BreachCheckState, PassMonitor } from "@repo/client";
import { SessionContext } from "@repo/client";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { rememberOverlayReturn } from "@/app/overlay-return";
import { passMonitorPaths } from "@/app/route-paths";
import { renderWithProviders, screen, within } from "@/test/render";
import PassMonitorRoutes from "./routes";

const mocks = vi.hoisted(() => ({
  monitor: {} as PassMonitor,
  breach: {} as BreachCheckState,
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  usePassMonitor: () => mocks.monitor,
  useBreachCheck: () => mocks.breach,
  useVaults: () => ({ getVault: () => undefined, hasSeveralVaults: false }),
  useRecordVault: () => ({ writable: true }),
  useAutoReconnect: () => {},
  useLinkDeviceCredential: () => {},
}));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  isMobile: () => viewport.mobile,
}));

const record = (recordId: string, title: string) =>
  ({
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
  }) as never;

const github = record("a", "GitHub");
const figma = record("b", "Figma");

const session = { vaultUnlocked: true, mode: "local" } as ContextType<typeof SessionContext>;

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook}>
      <SessionContext.Provider value={session}>
        <PassMonitorRoutes />
      </SessionContext.Provider>
    </Router>,
  );
  return location;
}

beforeEach(() => {
  mocks.monitor = {
    monitored: [github, figma],
    weak: [],
    weakFailed: false,
    reused: [{ id: "r", records: [github, figma] }],
    duplicates: [],
    old: [],
    insecure: [],
    missingTwoFactor: [],
    twoFactorFailed: false,
  };
  mocks.breach = {
    enabled: true,
    setEnabled: vi.fn(async () => undefined),
    breached: [],
    checking: false,
    failed: false,
    offline: false,
    lastCheckedAt: new Date().toISOString(),
    recheck: vi.fn(),
  };
  rememberOverlayReturn("/");
});
afterEach(() => {
  viewport.mobile = false;
});

describe("Pass Monitor overlay (desktop)", () => {
  it("opens on the first finding with issues, marked in the list", () => {
    renderAt(passMonitorPaths.index);

    expect(screen.getByRole("heading", { level: 1, name: "Pass Monitor" })).toBeInTheDocument();
    expect(screen.getByText(/2 passwords in 1 vault · breaches checked/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Reused passwords" })).toBeInTheDocument();
    const findings = screen.getByRole("navigation", { name: "Findings" });
    expect(within(findings).getByRole("link", { name: /Reused passwords/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(findings).getByRole("link", { name: /Weak passwords/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("checks breaches again, and closes back to where it was opened", async () => {
    rememberOverlayReturn("/record/a");
    const location = renderAt(passMonitorPaths.weak);

    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(mocks.breach.recheck).toHaveBeenCalledOnce();

    await userEvent.keyboard("{Escape}");
    expect(location.history.at(-1)).toBe("/record/a");
  });
});

describe("Pass Monitor on a phone", () => {
  beforeEach(() => {
    viewport.mobile = true;
  });

  it("starts on the overview: the score and the findings as drill-downs", () => {
    renderAt(passMonitorPaths.index);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Pass Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Security score" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reused passwords/ })).toHaveAttribute(
      "href",
      passMonitorPaths.reused,
    );
    expect(screen.getByRole("button", { name: "Close Pass Monitor" })).toBeInTheDocument();
  });

  it("pushes a finding as its own page, with a way back", () => {
    renderAt(passMonitorPaths.reused);

    expect(screen.getByRole("heading", { level: 1, name: "Reused passwords" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Pass Monitor" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Findings" })).toBeNull();
  });
});
