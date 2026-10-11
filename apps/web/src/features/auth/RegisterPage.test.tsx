import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, TEST_SERVER_URL, waitFor } from "@/test/render";
import RegisterPage from "./RegisterPage";

const registerNewUser = vi.fn();
const { createEmergencyKit } = vi.hoisted(() => ({
  createEmergencyKit: vi.fn(async () => ({
    fileName: "passmgr-emergency-kit.pdf",
    bytes: new Uint8Array([37, 80, 68, 70]),
  })),
}));

vi.mock("@repo/client/src/account/emergency-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/account/emergency-kit")>()),
  createEmergencyKit,
}));
const navigate = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("@repo/client", async () => ({
  ...(await (await import("@/test/emergency-kit-mock")).emergencyKitMocks()),
  useRegistration: () => ({
    registerNewUser,
    registrationError: mockRegistrationError,
  }),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/", navigate],
  };
});

let mockRegistrationError = false;

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});

async function submitForm() {
  await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
  await userEvent.type(screen.getByLabelText("Master password"), "hunter2hunter2");
  await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    registerNewUser.mockReset();
    navigate.mockReset();
    writeText.mockClear();
    mockRegistrationError = false;
  });

  it("does not show the recovery dialog until registration succeeds", () => {
    registerNewUser.mockResolvedValue(undefined);
    renderWithProviders(<RegisterPage />);
    expect(screen.queryByText(/save your recovery key/i)).not.toBeInTheDocument();
  });

  it("opens recovery key dialog with the returned key after successful registration", async () => {
    const key = new Uint8Array([1, 2, 3, 4, 5]);
    registerNewUser.mockResolvedValue(key);

    renderWithProviders(<RegisterPage />);
    await submitForm();

    await screen.findByText(/save your recovery key/i);
    // The key is split into color-coded chunks, but the <code> text stays exact.
    const code = document.querySelector("code");
    expect(code?.textContent).toBe("AQIDBAU=");
    expect(code?.className).toContain("select-all");
  });

  it("'I saved it' button is disabled until the user copies the key", async () => {
    const key = new Uint8Array([1, 2, 3]);
    registerNewUser.mockResolvedValue(key);

    renderWithProviders(<RegisterPage />);
    await submitForm();

    const saved = await screen.findByRole("button", { name: /i saved it/i });
    expect(saved).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));

    expect(writeText).toHaveBeenCalledWith("AQID");
    expect(saved).toBeEnabled();
  });

  it("downloads the emergency kit for the registered email, which counts as saved", async () => {
    const key = new Uint8Array([1, 2, 3]);
    registerNewUser.mockResolvedValue(key);
    const createObjectURL = vi.fn(() => "blob:kit");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithProviders(<RegisterPage />);
    await submitForm();

    const saved = await screen.findByRole("button", { name: /i saved it/i });
    await userEvent.click(screen.getByRole("button", { name: /emergency kit/i }));

    expect(createEmergencyKit).toHaveBeenCalledWith({
      recoveryKey: key,
      account: { email: "new@example.com", serverUrl: TEST_SERVER_URL },
      name: undefined,
      appUrl: window.location.origin,
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/emergency kit downloaded/i)).toBeInTheDocument();
    expect(saved).toBeEnabled();
    click.mockRestore();
  });

  it("wipes recovery key and navigates to /login on confirm", async () => {
    const key = new Uint8Array([9, 9, 9]);
    registerNewUser.mockResolvedValue(key);

    renderWithProviders(<RegisterPage />);
    await submitForm();

    await screen.findByText(/save your recovery key/i);
    await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await userEvent.click(screen.getByRole("button", { name: /i saved it/i }));

    await waitFor(() => {
      expect(key.every((b) => b === 0)).toBe(true);
      expect(navigate).toHaveBeenCalledWith("/login");
    });
  });

  it("surfaces a generic error message when registrationError is true", () => {
    mockRegistrationError = true;
    renderWithProviders(<RegisterPage />);
    expect(screen.getByText(/error when trying to register a new account/i)).toBeInTheDocument();
  });

  describe("with an invite link", () => {
    beforeEach(() => {
      window.history.replaceState(null, "", "/register?invite=abc123");
      return () => window.history.replaceState(null, "", "/");
    });

    it("passes the invite code to registerNewUser", async () => {
      registerNewUser.mockResolvedValue(undefined);
      renderWithProviders(<RegisterPage />);
      await submitForm();

      await waitFor(() => {
        expect(registerNewUser).toHaveBeenCalledWith("new@example.com", "hunter2hunter2", "abc123");
      });
    });

    it("explains that the invite may be bad when registration fails", () => {
      mockRegistrationError = true;
      renderWithProviders(<RegisterPage />);
      expect(screen.getByText(/invite may be invalid, expired/i)).toBeInTheDocument();
    });
  });

  it("locks the form while registering and unlocks it when registration fails", async () => {
    let finish!: (key: Uint8Array | undefined) => void;
    registerNewUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    renderWithProviders(<RegisterPage />);
    await submitForm();

    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Master password")).toBeDisabled();

    finish(undefined);
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeEnabled());
  });
});
