import { SessionContext } from "@repo/client/src/providers/SessionProvider";
import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPaths } from "@/app/route-paths";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RecoverPage from "./RecoverPage";

const checkRecoveryKey = vi.fn();
const recover = vi.fn();
const recoverLocal = vi.fn();
const signInToAccount = vi.fn();
const unlockLocal = vi.fn();
const clearRecoveryError = vi.fn();
const navigate = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
const readText = vi.fn();

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

let mockRecoveryError: string | undefined;
let mockProfile: LocalProfile | null = null;
let mockBiometrics = false;
let mockNetworkOffline = false;
let mockSearch = "";

vi.mock("@repo/client", async () => {
  const { RECOVERY_ERROR_MESSAGES } = await vi.importActual<
    typeof import("@repo/client/src/hooks/use-recovery")
  >("@repo/client/src/hooks/use-recovery");
  const { SessionContext } = await vi.importActual<
    typeof import("@repo/client/src/providers/SessionProvider")
  >("@repo/client/src/providers/SessionProvider");
  const { useSecondFactorRequest } = await vi.importActual<
    typeof import("@repo/client/src/hooks/use-second-factor-request")
  >("@repo/client/src/hooks/use-second-factor-request");
  return {
    ...(await (await import("@/test/emergency-kit-mock")).emergencyKitMocks()),
    ...(await (await import("@/test/password-generator-mock")).passwordGeneratorMocks()),
    usePasswordStrength: () => null,
    profileHue: () => 200,
    RECOVERY_ERROR_MESSAGES,
    SessionContext,
    signInToAccount: (...args: unknown[]) => signInToAccount(...args),
    useSecondFactorRequest,
    useServerHost: () => "passmgr.example",
    useLogin: () => ({ loginUser: vi.fn() }),
    useUnlock: () => ({ unlock: vi.fn(), unlockLocal, unlockByEmail: vi.fn() }),
    useRecovery: () => ({
      checkRecoveryKey,
      recover,
      recoverLocal,
      recoveryError: mockRecoveryError,
      clearRecoveryError,
    }),
    useStore: () => ({
      loaded: true,
      profile: mockProfile,
      profiles: mockProfile ? [mockProfile] : [],
      active: mockProfile && { entry: { name: "Home vault" }, profile: mockProfile },
      biometricKeyMaterial: mockBiometrics ? {} : null,
    }),
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
const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText, readText },
});

function keyGroups() {
  return screen.getAllByRole("textbox", { name: /group \d of 4/i }) as HTMLInputElement[];
}

async function enterKey() {
  await userEvent.click(keyGroups()[0] as HTMLElement);
  await userEvent.paste(KEY);
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

async function choosePassword({ confirm = "a new password" } = {}) {
  await userEvent.type(await screen.findByLabelText("New password"), "a new password");
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /^reset password$/i }));
}

beforeEach(() => {
  for (const fn of [checkRecoveryKey, recover, recoverLocal, signInToAccount, unlockLocal])
    fn.mockReset();
  checkRecoveryKey.mockResolvedValue(true);
  clearRecoveryError.mockClear();
  navigate.mockReset();
  writeText.mockClear();
  readText.mockReset();
  mockRecoveryError = undefined;
  mockProfile = null;
  mockBiometrics = false;
  mockNetworkOffline = false;
  mockSearch = "";
});

describe("RecoverPage from the account login", () => {
  it("checks the key, then resets with email, key and new password", async () => {
    recover.mockResolvedValue(undefined);
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();

    expect(checkRecoveryKey).toHaveBeenCalledWith(KEY, false);
    expect(await screen.findByText("Choose a new password")).toBeInTheDocument();
    expect(screen.getByText(/signed out on all your devices/i)).toBeInTheDocument();
    await choosePassword();

    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith("alice@example.com", KEY, "a new password");
    });
  });

  it("takes the email typed on the login form, still editable", async () => {
    window.history.replaceState({ email: "bob@example.com" }, "");
    renderPage();
    window.history.replaceState(null, "");

    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("bob@example.com");
    await userEvent.clear(email);
    await userEvent.type(email, "alice@example.com");
    expect(email).toHaveValue("alice@example.com");
  });

  it("generates a passphrase into both new password fields", async () => {
    recover.mockResolvedValue(undefined);
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();

    await userEvent.click(await screen.findByRole("button", { name: "Generate" }));
    expect(await screen.findByText(/keep it with your emergency kit/)).toBeInTheDocument();
    const use = screen.getByRole("button", { name: "Use" });
    await waitFor(() => expect(use).toBeEnabled());
    await userEvent.click(use);

    const password = (screen.getByLabelText("New password") as HTMLInputElement).value;
    expect(password).toMatch(/^\w+(-\w+){3}$/);
    expect(screen.getByLabelText("Confirm new password")).toHaveValue(password);
    await userEvent.click(screen.getByRole("button", { name: /^reset password$/i }));
    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith("alice@example.com", KEY, password);
    });
  });

  it("spreads a pasted key over the four groups", async () => {
    renderPage();
    await userEvent.click(keyGroups()[0] as HTMLElement);
    await userEvent.paste(`${KEY.slice(0, 22)}  ${KEY.slice(22)}`);

    expect(keyGroups().map((input) => input.value)).toEqual([
      KEY.slice(0, 11),
      KEY.slice(11, 22),
      KEY.slice(22, 33),
      KEY.slice(33),
    ]);
  });

  it("fills the key from the clipboard", async () => {
    readText.mockResolvedValue(`${KEY}\n`);
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^paste$/i }));

    await waitFor(() => expect(keyGroups()[3]?.value).toBe(KEY.slice(33)));
  });

  it("stays on the key step when the key isn't one", async () => {
    checkRecoveryKey.mockResolvedValue(false);
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();

    expect(checkRecoveryKey).toHaveBeenCalled();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("blocks the reset when the passwords don't match", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();
    await choosePassword({ confirm: "something else" });

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();
  });

  it("shows the new recovery key, wipes it and signs in with the new password", async () => {
    const key = new Uint8Array([1, 2, 3]);
    recover.mockResolvedValue(key);
    signInToAccount.mockResolvedValue(true);
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();
    await choosePassword();

    await screen.findByText(/old recovery key no longer works/i);
    expect(document.querySelector("code")?.textContent).toBe("AQID");
    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => {
      expect(signInToAccount).toHaveBeenCalledWith(
        expect.objectContaining({ profiles: [] }),
        "alice@example.com",
        "a new password",
        expect.any(Function),
      );
    });
    expect(key.every((b) => b === 0)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("goes to the account login when signing in after the reset fails", async () => {
    recover.mockResolvedValue(new Uint8Array([1, 2, 3]));
    signInToAccount.mockResolvedValue(false);
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();
    await choosePassword();
    await userEvent.click(await screen.findByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(authPaths.accountLogin));
  });

  it("goes back to the account login", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(navigate).toHaveBeenCalledWith(authPaths.accountLogin);
  });

  it("explains an invalid key on the key step, until the key is edited", async () => {
    mockRecoveryError = "invalid_key";
    renderPage();
    expect(screen.getByText(/doesn't look like a recovery key/i)).toBeInTheDocument();

    await userEvent.type(keyGroups()[0] as HTMLElement, "A");
    expect(clearRecoveryError).toHaveBeenCalled();
  });

  it("asks before the tab closes while the new key is shown", async () => {
    recover.mockResolvedValue(new Uint8Array([1, 2, 3]));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();
    await choosePassword();
    await screen.findByText(/old recovery key no longer works/i);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("points a refused reset back to the key", async () => {
    mockRecoveryError = "failed";
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();

    expect(await screen.findByText("Check this recovery key")).toBeInTheDocument();
    expect(screen.getByText(/can't be reset/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /check the key/i }));
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
  });

  it("explains the throttle on the password step", async () => {
    mockRecoveryError = "throttled";
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "alice@example.com");
    await enterKey();

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it("says up front that an account's reset needs a connection", () => {
    mockNetworkOffline = true;
    renderPage();
    expect(screen.getByText(/needs a connection to the server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });
});

describe("RecoverPage from an account's unlock card", () => {
  beforeEach(() => {
    mockProfile = ALICE;
    mockSearch = "vault=active";
  });

  it("takes the email from the profile", async () => {
    recover.mockResolvedValue(undefined);
    renderPage();

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    await enterKey();
    await choosePassword();

    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith("alice@example.com", KEY, "a new password");
    });
  });

  it("signs in to the account although another profile became active", async () => {
    recover.mockImplementation(async () => {
      // The reset removed the stale profile: a local vault is the active one now.
      mockProfile = LOCAL;
      return new Uint8Array([1, 2, 3]);
    });
    signInToAccount.mockResolvedValue(true);
    renderPage();
    await enterKey();
    await choosePassword();
    await userEvent.click(await screen.findByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => {
      expect(signInToAccount).toHaveBeenCalledWith(
        expect.anything(),
        "alice@example.com",
        "a new password",
        expect.any(Function),
      );
    });
    expect(unlockLocal).not.toHaveBeenCalled();
  });

  it("goes back to the unlock", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(navigate).toHaveBeenCalledWith(authPaths.login);
  });
});

describe("RecoverPage local vault", () => {
  beforeEach(() => {
    mockProfile = LOCAL;
    mockSearch = "vault=active";
  });

  it("asks for no email, recovers on the device, offline too, and unlocks", async () => {
    mockNetworkOffline = true;
    mockBiometrics = true;
    recoverLocal.mockResolvedValue(new Uint8Array([1, 2, 3]));
    unlockLocal.mockResolvedValue(true);
    renderPage();

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("Home vault")).toBeInTheDocument();
    expect(screen.queryByText(/needs a connection/i)).not.toBeInTheDocument();
    await enterKey();

    expect(checkRecoveryKey).toHaveBeenCalledWith(KEY, true);
    expect(await screen.findByText("Recovery key accepted")).toBeInTheDocument();
    expect(screen.getByText(/biometric unlock is switched off/i)).toBeInTheDocument();
    expect(screen.queryByText(/signed out on all/i)).not.toBeInTheDocument();
    await choosePassword();

    await waitFor(() => {
      expect(recoverLocal).toHaveBeenCalledWith(KEY, "a new password");
    });
    expect(recover).not.toHaveBeenCalled();
    expect(await screen.findByText(/never leaves this device\./i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => {
      expect(unlockLocal).toHaveBeenCalledWith("a new password", expect.any(Function));
    });
    expect(signInToAccount).not.toHaveBeenCalled();
  });

  it("doesn't blame the key, already checked, for a failed reset", async () => {
    mockRecoveryError = "failed";
    renderPage();
    await enterKey();

    expect(await screen.findByText("Recovery key accepted")).toBeInTheDocument();
    expect(screen.getByText(/recovery failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/can't be reset/i)).toBeNull();
  });

  it("explains the wrong_key error", () => {
    mockRecoveryError = "wrong_key";
    renderPage();
    expect(screen.getByText(/doesn't open this vault/i)).toBeInTheDocument();
  });
});
