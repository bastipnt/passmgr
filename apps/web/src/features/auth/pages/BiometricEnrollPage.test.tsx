import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import BiometricEnrollPage from "./BiometricEnrollPage";

const navigate = vi.fn();
const setBiometricKeyMaterial = vi.fn().mockResolvedValue(undefined);
const setBiometricDismissed = vi.fn();
const getPassword = vi.fn();
const clearPassword = vi.fn();
const exportVaultKeyForWorker = vi.fn(() => new Uint8Array(32));
const credentialsCreate = vi.fn();

vi.mock("@repo/client", () => ({
  useStore: () => ({
    vault: { setBiometricKeyMaterial },
    setBiometricDismissed,
  }),
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

const navWithCredentials = globalThis.navigator as unknown as { credentials?: unknown };
const originalCredentials = navWithCredentials.credentials;

function fakeCredentialWithPrf(): PublicKeyCredential {
  const prfOutput = new Uint8Array(32);
  crypto.getRandomValues(prfOutput);
  return {
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    getClientExtensionResults: () => ({
      prf: { results: { first: prfOutput.buffer as ArrayBuffer } },
    }),
  } as unknown as PublicKeyCredential;
}

describe("BiometricEnrollPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    setBiometricKeyMaterial.mockClear();
    setBiometricDismissed.mockReset();
    getPassword.mockReset();
    clearPassword.mockReset();
    credentialsCreate.mockReset();
    Object.defineProperty(globalThis.navigator, "credentials", {
      configurable: true,
      value: { create: credentialsCreate },
    });
  });

  afterEach(() => {
    if (originalCredentials === undefined) {
      delete navWithCredentials.credentials;
    } else {
      Object.defineProperty(globalThis.navigator, "credentials", {
        configurable: true,
        value: originalCredentials,
      });
    }
  });

  it("happy path: enrolls and navigates to /", async () => {
    getPassword.mockReturnValue("hunter2hunter2");
    credentialsCreate.mockResolvedValue(fakeCredentialWithPrf());

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    await waitFor(() => {
      expect(credentialsCreate).toHaveBeenCalledTimes(1);
      expect(setBiometricKeyMaterial).toHaveBeenCalledTimes(1);
      expect(clearPassword).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith("/");
    });
    const material = setBiometricKeyMaterial.mock.calls[0]?.[0] as Record<string, string>;
    expect(typeof material.biometricEncryptedVaultKey).toBe("string");
    expect(typeof material.credentialId).toBe("string");
    expect(typeof material.prfSalt).toBe("string");
  });

  it("renders error when secretsStore has no cached password", async () => {
    getPassword.mockReturnValue(undefined);

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    expect(await screen.findByText(/using fingerprint to unlock failed/i)).toBeInTheDocument();
    expect(credentialsCreate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("renders error when WebAuthn rejects (e.g. PRF unsupported)", async () => {
    getPassword.mockReturnValue("hunter2hunter2");
    credentialsCreate.mockRejectedValue(new Error("PRF not supported"));

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
