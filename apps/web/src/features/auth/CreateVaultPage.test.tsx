import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { authPaths } from "@/app/route-paths";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import CreateVaultPage from "./CreateVaultPage";
import { HoldUnlockRedirectContext } from "./unlock-redirect";

const createLocalVault = vi.fn();
const finishLocalVault = vi.fn();
const linkAccount = vi.fn();
const holdRedirect = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
let mockRegistrationEnabled = true;
let mockCreateError: string | undefined;
let mockLinkError: string | undefined;
let mockPersistent: boolean | null = true;

// The real `useCreateVault` over its two steps.
vi.mock("@repo/client/src/hooks/use-create-local-vault", () => ({
  useCreateLocalVault: () => ({ createLocalVault, finishLocalVault, createError: mockCreateError }),
}));
vi.mock("@repo/client/src/hooks/use-link-account", () => ({
  useLinkAccount: () => ({ linkAccount, linkError: mockLinkError, clearLinkError: vi.fn() }),
  LINK_ACCOUNT_ERROR_MESSAGES: { rejected: "This email belongs to another account." },
}));
vi.mock("@repo/client", async () => ({
  ...(await (await import("@/test/emergency-kit-mock")).emergencyKitMocks()),
  ...(await (await import("@/test/password-generator-mock")).passwordGeneratorMocks()),
  ...(await import("@repo/client/src/hooks/use-link-account")),
  ...(await vi.importActual<object>("@repo/client/src/hooks/use-create-vault")),
  usePasswordStrength: () => null,
  useAppConfig: () => ({ registrationEnabled: mockRegistrationEnabled, isLoading: false }),
  useStore: () => ({ profiles: [] }),
}));

vi.mock("@/hooks/use-storage-persistent", () => ({ useStoragePersistent: () => mockPersistent }));
vi.mock("@/hooks/use-storage-durability", () => ({ requestPersistentStorage: vi.fn() }));

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});

const PASSWORD = "hunter2hunter2";

function renderPage(path: string = authPaths.create) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <HoldUnlockRedirectContext value={holdRedirect}>
        <CreateVaultPage />
      </HoldUnlockRedirectContext>
    </Router>,
  );
  return location;
}

async function fillVault({ name = "", confirm = PASSWORD } = {}) {
  if (name) await userEvent.type(screen.getByLabelText("Vault name"), name);
  await userEvent.type(screen.getByLabelText("Password"), PASSWORD);
  await userEvent.type(screen.getByLabelText("Confirm password"), confirm);
}

async function saveRecoveryKey() {
  await screen.findByText(/save your recovery key/i);
  await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
  await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));
}

async function toEmailStep(name = "") {
  await fillVault({ name });
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await userEvent.click(screen.getByRole("button", { name: /yes, sync this vault/i }));
  await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
}

describe("CreateVaultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistrationEnabled = true;
    mockCreateError = undefined;
    mockLinkError = undefined;
    mockPersistent = true;
    createLocalVault.mockImplementation(async () => new Uint8Array([1, 2, 3]));
    finishLocalVault.mockResolvedValue(true);
    linkAccount.mockResolvedValue(true);
  });

  it("doesn't go on when the passwords differ", async () => {
    renderPage();
    await fillVault({ confirm: "hunter2hunter3" });
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText(/passwords do not match/i);
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("Not now: a vault on this device only, opened once its recovery key is saved", async () => {
    renderPage();
    await fillVault({ name: "Travel" });
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    await screen.findByText(/save your recovery key/i);
    expect(createLocalVault).toHaveBeenCalledWith(PASSWORD, "Travel");
    expect(finishLocalVault).not.toHaveBeenCalled();

    await saveRecoveryKey();
    expect(finishLocalVault).toHaveBeenCalledTimes(1);
    expect(linkAccount).not.toHaveBeenCalled();
    expect(holdRedirect).not.toHaveBeenCalledWith(true);
  });

  it("Yes: the local vault becomes an account with the same password", async () => {
    renderPage();
    await toEmailStep("Travel");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText(/save your recovery key/i);
    expect(createLocalVault).toHaveBeenCalledWith(PASSWORD, "Travel");
    expect(linkAccount).toHaveBeenCalledWith("new@example.com", PASSWORD, undefined);
    expect(finishLocalVault.mock.invocationCallOrder[0]).toBeLessThan(
      linkAccount.mock.invocationCallOrder[0]!,
    );
    // Held while the key is shown, released once it is saved.
    await saveRecoveryKey();
    expect(holdRedirect.mock.calls).toEqual([[true], [false]]);
  });

  it("passes the invite along to the account", async () => {
    mockRegistrationEnabled = false;
    renderPage(`${authPaths.create}?invite=abc123`);
    await toEmailStep();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(linkAccount).toHaveBeenCalledWith("new@example.com", PASSWORD, "abc123"),
    );
  });

  it("a server that can't be reached: try again, or keep the vault local only", async () => {
    linkAccount.mockImplementation(async () => {
      mockLinkError = "unreachable";
      return false;
    });
    renderPage();
    await toEmailStep();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText(/couldn.t reach the server/i);
    expect(screen.queryByText(/save your recovery key/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(linkAccount).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: /create local vault only/i }));
    await saveRecoveryKey();
    // Created once, whatever the retries.
    expect(createLocalVault).toHaveBeenCalledTimes(1);
    expect(finishLocalVault).toHaveBeenCalledTimes(1);
  });

  it("an email taken: the account's message at the email field", async () => {
    mockLinkError = "rejected";
    renderPage();
    await toEmailStep();
    expect(screen.getByText(/belongs to another account/i)).toBeInTheDocument();
  });

  it("Back keeps what was typed; once the vault exists, its password can't change", async () => {
    linkAccount.mockImplementation(async () => {
      mockLinkError = "unreachable";
      return false;
    });
    renderPage();
    await fillVault({ name: "Travel" });
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByLabelText("Vault name")).toHaveValue("Travel");
    expect(screen.getByLabelText("Password")).toHaveValue(PASSWORD);

    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await userEvent.click(screen.getByRole("button", { name: /yes, sync this vault/i }));
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText(/couldn.t reach the server/i);

    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByText(/sync across devices\?/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /yes, sync this vault/i }));
    expect(screen.getByLabelText("Email")).toHaveValue("new@example.com");
  });

  it("warns before leaving while a created vault's recovery key wasn't shown", async () => {
    linkAccount.mockImplementation(async () => {
      mockLinkError = "unreachable";
      return false;
    });
    renderPage();
    await toEmailStep();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText(/couldn.t reach the server/i);

    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /create local vault only/i }));
    await saveRecoveryKey();
    const left = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
  });

  it("registration closed: one step that creates the vault", async () => {
    mockRegistrationEnabled = false;
    renderPage();
    expect(screen.queryByText(/step 1 of 2/i)).not.toBeInTheDocument();
    await fillVault();
    await userEvent.click(screen.getByRole("button", { name: /^create vault$/i }));

    await saveRecoveryKey();
    expect(createLocalVault).toHaveBeenCalledWith(PASSWORD, "");
    expect(linkAccount).not.toHaveBeenCalled();
  });

  it("a private window: the note on the sync step, where an account would keep the vault", async () => {
    mockPersistent = false;
    renderPage();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await fillVault();
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(screen.getByRole("note")).toHaveTextContent(/online account/i);
  });

  it("a private window, registration closed: the note on the only step", () => {
    mockPersistent = false;
    mockRegistrationEnabled = false;
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(/use a normal window/i);
  });

  it("a created vault that didn't open: points to the unlock, creates no second one", async () => {
    finishLocalVault.mockImplementation(async () => {
      mockCreateError = "unlock_failed";
      return false;
    });
    mockRegistrationEnabled = false;
    renderPage();
    await fillVault();
    await userEvent.click(screen.getByRole("button", { name: /^create vault$/i }));

    await saveRecoveryKey();
    expect(screen.getByRole("link", { name: /unlock it with your password/i })).toHaveAttribute(
      "href",
      authPaths.login,
    );

    await userEvent.click(screen.getByRole("button", { name: /^create vault$/i }));
    expect(createLocalVault).toHaveBeenCalledTimes(1);
  });

  it("linking a vault that didn't open: shows its key, and never links it", async () => {
    finishLocalVault.mockImplementation(async () => {
      mockCreateError = "unlock_failed";
      return false;
    });
    renderPage();
    await toEmailStep();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await saveRecoveryKey();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(createLocalVault).toHaveBeenCalledTimes(1);
    expect(linkAccount).not.toHaveBeenCalled();
  });

  it("explains a failed write", () => {
    mockCreateError = "failed";
    renderPage();
    expect(screen.getByText(/creating the vault failed/i)).toBeInTheDocument();
  });
});
