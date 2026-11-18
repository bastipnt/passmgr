import type { BreachCheckState, PassMonitor } from "@repo/client";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { renderWithProviders, screen } from "@/test/render";
import BreachedPasswordsPage from "./BreachedPasswordsPage";
import InsecureWebsitesPage from "./InsecureWebsitesPage";
import MissingTwoFactorPage from "./MissingTwoFactorPage";
import { PassMonitorProvider } from "./PassMonitorContext";
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
  useRecordVault: () => ({ writable: true }),
}));

const inMonitor = (page: ReactElement) => <PassMonitorProvider>{page}</PassMonitorProvider>;
const renderMonitor = (page: ReactElement) => renderWithProviders(inMonitor(page));

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
  monitored: null,
  weak: null,
  weakFailed: false,
  reused: null,
  duplicates: null,
  old: null,
  insecure: null,
  missingTwoFactor: null,
  twoFactorFailed: false,
};

const breachOff: BreachCheckState = {
  enabled: false,
  setEnabled: vi.fn(async () => undefined),
  breached: null,
  checking: false,
  failed: false,
  offline: false,
  lastCheckedAt: null,
  recheck: vi.fn(),
};

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.monitor = checking;
  mocks.breach = breachOff;
});

describe("PassMonitorPage", () => {
  it("shows a spinner per category while checking, then the counts", () => {
    const { rerender } = renderMonitor(<PassMonitorPage />);
    expect(screen.getByLabelText("Checking weak passwords")).toBeInTheDocument();

    const github = login("a", "GitHub");
    const figma = login("b", "Figma");
    mocks.monitor = {
      monitored: [github, figma],
      weak: [{ record: github, strength: { level: "weak", label: "Weak" } }],
      weakFailed: false,
      reused: [{ id: "a", records: [github, figma] }],
      duplicates: [],
      old: [],
      insecure: [{ record: figma, hosts: ["figma.com"] }],
      missingTwoFactor: [],
      twoFactorFailed: false,
    };
    rerender(inMonitor(<PassMonitorPage />));

    expect(screen.getByLabelText("1 Weak passwords")).toBeInTheDocument();
    expect(screen.getByLabelText("2 Reused passwords")).toBeInTheDocument();
    expect(screen.getByLabelText("0 Duplicates")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Insecure websites")).toBeInTheDocument();
    expect(screen.getByLabelText("0 Missing 2FA")).toBeInTheDocument();
  });

  it("scores the findings, naming the checks left out", () => {
    const { rerender } = renderMonitor(<PassMonitorPage />);
    expect(screen.getByLabelText("Calculating security score")).toBeInTheDocument();

    const github = login("a", "GitHub");
    const figma = login("b", "Figma");
    mocks.monitor = {
      ...checking,
      monitored: [github, figma],
      weak: [],
      reused: [],
      duplicates: [],
      old: [],
      insecure: [{ record: figma, hosts: ["figma.com"] }],
      missingTwoFactor: [],
    };
    rerender(inMonitor(<PassMonitorPage />));

    expect(screen.getByRole("meter", { name: "Security score" })).toHaveAttribute(
      "aria-valuenow",
      "85",
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 passwords needs attention.")).toBeInTheDocument();
    expect(screen.getByText("Not counted: breaches.")).toBeInTheDocument();
  });

  it("offers Change on a weak password, opening its edit with the generator", () => {
    const github = login("a", "GitHub");
    mocks.monitor = {
      ...checking,
      weak: [
        {
          record: github,
          strength: { level: "weak", label: "Weak", warning: "A common password" },
        },
      ],
    };
    renderMonitor(<WeakPasswordsPage />);

    expect(screen.getByText("Weak: A common password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change GitHub" })).toHaveAttribute(
      "href",
      recordPaths.changePassword("a"),
    );
    expect(screen.getByText(/generator ready/)).toBeInTheDocument();
  });

  it("says when the strength check couldn't run", () => {
    mocks.monitor = { ...checking, weakFailed: true };
    renderMonitor(<WeakPasswordsPage />);

    expect(screen.getByText(/strength check couldn't load/)).toBeInTheDocument();
  });
});

describe("ReusedPasswordsPage", () => {
  it("groups the records without showing the shared password, each opening its record", () => {
    mocks.monitor = {
      ...checking,
      reused: [{ id: "a", records: [login("a", "GitHub"), login("b", "Figma")] }],
    };
    renderMonitor(<ReusedPasswordsPage />);

    expect(screen.getByRole("heading", { name: "Used in 2 places" })).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      recordPaths.record("a"),
    );
  });

  it("says so when every password is unique", () => {
    mocks.monitor = { ...checking, reused: [] };
    renderMonitor(<ReusedPasswordsPage />);

    expect(screen.getByText("Every password is unique.")).toBeInTheDocument();
  });
});

describe("BreachedPasswordsPage", () => {
  it("is off until turned on, and the overview says so", async () => {
    const { unmount } = renderMonitor(<PassMonitorPage />);
    expect(screen.getByRole("link", { name: /Breached passwords/ })).toHaveTextContent("Off");
    unmount();

    renderMonitor(<BreachedPasswordsPage />);
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
    renderMonitor(<BreachedPasswordsPage />);

    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      recordPaths.record("a"),
    );
    expect(screen.getByText("Seen 1,200 times in data breaches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change GitHub" })).toHaveAttribute(
      "href",
      recordPaths.changePassword("a"),
    );
    expect(screen.getByText(/Last checked just now/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Breach check" })).toBeChecked();
  });

  it("explains an offline device without stored results", () => {
    mocks.breach = { ...breachOff, enabled: true, offline: true };
    renderMonitor(<BreachedPasswordsPage />);

    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
  });
});

describe("InsecureWebsitesPage", () => {
  it("lists logins with their plain HTTP websites", () => {
    mocks.monitor = {
      ...checking,
      insecure: [{ record: login("a", "Router"), hosts: ["192.168.1.1", "router.lan"] }],
    };
    renderMonitor(<InsecureWebsitesPage />);

    expect(screen.getByText("http://192.168.1.1, http://router.lan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Router" })).toHaveAttribute(
      "href",
      recordPaths.editRecord("a"),
    );
  });
});

describe("MissingTwoFactorPage", () => {
  it("names the site that supports 2FA and credits 2fa.directory", () => {
    mocks.monitor = {
      ...checking,
      missingTwoFactor: [{ record: login("a", "GitHub"), site: { domain: "github.com" } }],
    };
    renderMonitor(<MissingTwoFactorPage />);

    expect(screen.getByText("github.com supports 2FA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2fa.directory" })).toHaveAttribute(
      "href",
      "https://2fa.directory",
    );
  });

  it("says when the directory couldn't load", () => {
    mocks.monitor = { ...checking, twoFactorFailed: true };
    renderMonitor(<MissingTwoFactorPage />);

    expect(screen.getByText(/2FA directory couldn't load/)).toBeInTheDocument();
  });
});
