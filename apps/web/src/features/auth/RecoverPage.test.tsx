import { SessionContext } from "@repo/client/src/providers/SessionProvider";
import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RecoverPage from "./RecoverPage";

const recover = vi.fn();
const recoverLocal = vi.fn();
const navigate = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

let mockRecoveryError: string | undefined;
let mockProfile: LocalProfile | null = null;
let mockNetworkOffline = false;
let mockSearch = "";

vi.mock("@repo/client", async () => {
  const { RECOVERY_ERROR_MESSAGES } = await vi.importActual<
    typeof import("@repo/client/src/hooks/use-recovery")
  >("@repo/client/src/hooks/use-recovery");
  const { SessionContext } = await vi.importActual<
    typeof import("@repo/client/src/providers/SessionProvider")
  >("@repo/client/src/providers/SessionProvider");
  return {
    RECOVERY_ERROR_MESSAGES,
    SessionContext,
    useRecovery: () => ({ recover, recoverLocal, recoveryError: mockRecoveryError }),
    useStore: () => ({ profile: mockProfile }),
  };
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/", navigate],
    useSearchParams: () => [new URLSearchParams(mockSearch)],
  };
});

function renderPage() {
  const session = { networkOffline: mockNetworkOffline } as ContextType<typeof SessionContext>;
  return renderWithProviders(
    <SessionContext.Provider value={session}>
      <RecoverPage />
    </SessionContext.Provider>,
  );
}

const LOCAL: LocalProfile = { profileId: "p-local", mode: "local", email: null, userId: null };

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});

async function fillForm({ confirm = "a new password" } = {}) {
  await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
  await userEvent.type(screen.getByLabelText("Recovery key"), "AQIDBAU=");
  await userEvent.type(screen.getByLabelText("New password"), "a new password");
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /^reset password$/i }));
}

describe("RecoverPage", () => {
  beforeEach(() => {
    recover.mockReset();
    recoverLocal.mockReset();
    navigate.mockReset();
    writeText.mockClear();
    mockRecoveryError = undefined;
    mockProfile = null;
    mockNetworkOffline = false;
    mockSearch = "";
  });

  it("submits email, recovery key and new password", async () => {
    recover.mockResolvedValue(undefined);
    renderPage();
    await fillForm();

    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith("alice@example.com", "AQIDBAU=", "a new password");
    });
  });

  it("blocks submit when the passwords don't match", async () => {
    renderPage();
    await fillForm({ confirm: "something else" });

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();
  });

  it("shows the new recovery key, then wipes it and goes to login", async () => {
    const key = new Uint8Array([1, 2, 3]);
    recover.mockResolvedValue(key);
    renderPage();
    await fillForm();

    await screen.findByText(/old recovery key no longer works/i);
    expect(document.querySelector("code")?.textContent).toBe("AQID");

    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => {
      expect(key.every((b) => b === 0)).toBe(true);
      expect(navigate).toHaveBeenCalledWith("/login");
    });
  });

  it.each([
    ["invalid_key", /doesn't look like a recovery key/i],
    ["failed", /recovery failed/i],
    ["throttled", /too many attempts/i],
  ])("explains the %s error", (error, message) => {
    mockRecoveryError = error;
    renderPage();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("says up front that an account's recovery needs a connection", () => {
    mockNetworkOffline = true;
    renderPage();
    expect(screen.getByText(/needs a connection to the server/i)).toBeInTheDocument();
  });
});

describe("RecoverPage local vault", () => {
  beforeEach(() => {
    recover.mockReset();
    recoverLocal.mockReset();
    navigate.mockReset();
    mockRecoveryError = undefined;
    mockProfile = LOCAL;
    mockNetworkOffline = false;
    mockSearch = "vault=local";
  });

  async function fillLocalForm() {
    await userEvent.type(screen.getByLabelText("Recovery key"), "AQIDBAU=");
    await userEvent.type(screen.getByLabelText("New password"), "a new password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "a new password");
    await userEvent.click(screen.getByRole("button", { name: /^reset password$/i }));
  }

  it("asks for no email and recovers on the device, offline too", async () => {
    mockNetworkOffline = true;
    recoverLocal.mockResolvedValue(new Uint8Array([1, 2, 3]));
    renderPage();

    expect(screen.getByLabelText("Email")).not.toBeVisible();
    expect(screen.queryByText(/signed out on all devices/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs a connection/i)).not.toBeInTheDocument();
    await fillLocalForm();

    await waitFor(() => {
      expect(recoverLocal).toHaveBeenCalledWith("AQIDBAU=", "a new password");
    });
    expect(recover).not.toHaveBeenCalled();
    expect(await screen.findByText(/never leaves this device/i)).toBeInTheDocument();
  });

  it("falls back to an account's recovery when the active profile isn't local", async () => {
    mockProfile = { profileId: "p-1", mode: "linked", email: "a@b.c", userId: "u" };
    renderPage();

    expect(screen.getByLabelText("Email")).toBeVisible();
  });

  it("explains the wrong_key error", () => {
    mockRecoveryError = "wrong_key";
    renderPage();
    expect(screen.getByText(/doesn't open this vault/i)).toBeInTheDocument();
  });
});
