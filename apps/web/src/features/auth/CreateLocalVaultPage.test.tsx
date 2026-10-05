import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import CreateLocalVaultPage from "./CreateLocalVaultPage";

const createLocalVault = vi.fn();
const finishLocalVault = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
let mockCreateError: string | undefined;
let mockProfile: object | null = null;

vi.mock("@repo/client", () => ({
  useAppConfig: () => ({ registrationEnabled: false, isLoading: false }),
  useStore: () => ({ profile: mockProfile }),
  useCreateLocalVault: () => ({
    createLocalVault,
    finishLocalVault,
    createError: mockCreateError,
  }),
}));

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});

async function fillForm(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText("Master password"), password);
  await userEvent.type(screen.getByLabelText("Confirm master password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /^create vault$/i }));
}

describe("CreateLocalVaultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateError = undefined;
    mockProfile = null;
  });

  it("asks for no email: the vault needs no account", () => {
    renderWithProviders(<CreateLocalVaultPage />);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("doesn't create anything when the passwords differ", async () => {
    renderWithProviders(<CreateLocalVaultPage />);
    await fillForm("hunter2hunter2", "hunter2hunter3");

    await screen.findByText(/passwords do not match/i);
    expect(createLocalVault).not.toHaveBeenCalled();
  });

  it("shows the recovery key, and unlocks only once it is saved", async () => {
    createLocalVault.mockImplementation(async () => {
      mockProfile = { mode: "local" };
      return new Uint8Array([1, 2, 3]);
    });
    renderWithProviders(<CreateLocalVaultPage />);
    await fillForm("hunter2hunter2");

    expect(createLocalVault).toHaveBeenCalledWith("hunter2hunter2");
    await screen.findByText(/save your recovery key/i);
    expect(finishLocalVault).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => expect(finishLocalVault).toHaveBeenCalledTimes(1));
  });

  it("stays to explain a created vault that didn't open, pointing to the unlock", () => {
    mockProfile = { mode: "local" };
    mockCreateError = "unlock_failed";
    renderWithProviders(<CreateLocalVaultPage />);

    expect(screen.getByText(/couldn.t be opened/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /unlock it with your password/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("explains when the device already holds a vault", () => {
    mockCreateError = "vault_exists";
    renderWithProviders(<CreateLocalVaultPage />);
    expect(screen.getByText(/already holds a vault/i)).toBeInTheDocument();
  });
});
