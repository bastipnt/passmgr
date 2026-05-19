import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import BiometricEnrollPage from "./BiometricEnrollPage";

const navigate = vi.fn();
const setBiometricKeyMaterial = vi.fn().mockResolvedValue(undefined);
const setBiometricDismissed = vi.fn();
const enrollBiometric = vi.fn();
const getPassword = vi.fn();
const clearPassword = vi.fn();
const exportVaultKeyForWorker = vi.fn(() => new Uint8Array([1, 2, 3]));

vi.mock("@repo/client", () => ({
  useStore: () => ({
    vault: { setBiometricKeyMaterial },
    setBiometricDismissed,
  }),
}));

vi.mock("@repo/crypto", () => ({
  enrollBiometric: (...args: unknown[]) => enrollBiometric(...args),
}));

vi.mock("@repo/store", () => ({
  secretsStore: {
    exportVaultKeyForWorker: () => exportVaultKeyForWorker(),
    getPassword: () => getPassword(),
    clearPassword: () => clearPassword(),
  },
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/", navigate],
  };
});

describe("BiometricEnrollPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    setBiometricKeyMaterial.mockClear();
    setBiometricDismissed.mockReset();
    enrollBiometric.mockReset();
    getPassword.mockReset();
    clearPassword.mockReset();
  });

  it("happy path: enrolls and navigates to /", async () => {
    getPassword.mockReturnValue("hunter2hunter2");
    enrollBiometric.mockResolvedValue({ encryptedVaultKey: new Uint8Array() });

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    await waitFor(() => {
      expect(enrollBiometric).toHaveBeenCalledTimes(1);
      expect(setBiometricKeyMaterial).toHaveBeenCalledTimes(1);
      expect(clearPassword).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith("/");
    });
  });

  it("renders error when secretsStore has no cached password", async () => {
    getPassword.mockReturnValue(undefined);
    enrollBiometric.mockResolvedValue({});

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    expect(await screen.findByText(/using fingerprint to unlock failed/i)).toBeInTheDocument();
    expect(enrollBiometric).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("renders error when enrollBiometric rejects (e.g. PRF unsupported)", async () => {
    getPassword.mockReturnValue("hunter2hunter2");
    enrollBiometric.mockRejectedValue(new Error("PRF not supported"));

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    expect(await screen.findByText(/using fingerprint to unlock failed/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Skip clears password, dismisses biometric prompt, and navigates", async () => {
    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^skip$/i }));

    expect(clearPassword).toHaveBeenCalled();
    expect(setBiometricDismissed).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
