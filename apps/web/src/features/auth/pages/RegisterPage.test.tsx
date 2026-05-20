import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RegisterPage from "./RegisterPage";

const registerNewUser = vi.fn();
const navigate = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("@repo/client", () => ({
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
  await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await userEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
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
    const code = await screen.findByText(/AQIDBAU=/);
    expect(code.tagName.toLowerCase()).toBe("code");
    expect(code.className).toContain("select-all");
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
});
