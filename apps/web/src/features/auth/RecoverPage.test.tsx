import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RecoverPage from "./RecoverPage";

const recover = vi.fn();
const navigate = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

let mockRecoveryError: string | undefined;

vi.mock("@repo/client", async () => {
  const { RECOVERY_ERROR_MESSAGES } = await vi.importActual<
    typeof import("@repo/client/src/hooks/use-recovery")
  >("@repo/client/src/hooks/use-recovery");
  return {
    RECOVERY_ERROR_MESSAGES,
    useRecovery: () => ({ recover, recoveryError: mockRecoveryError }),
  };
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/", navigate],
  };
});

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
    navigate.mockReset();
    writeText.mockClear();
    mockRecoveryError = undefined;
  });

  it("submits email, recovery key and new password", async () => {
    recover.mockResolvedValue(undefined);
    renderWithProviders(<RecoverPage />);
    await fillForm();

    await waitFor(() => {
      expect(recover).toHaveBeenCalledWith("alice@example.com", "AQIDBAU=", "a new password");
    });
  });

  it("blocks submit when the passwords don't match", async () => {
    renderWithProviders(<RecoverPage />);
    await fillForm({ confirm: "something else" });

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();
  });

  it("shows the new recovery key, then wipes it and goes to login", async () => {
    const key = new Uint8Array([1, 2, 3]);
    recover.mockResolvedValue(key);
    renderWithProviders(<RecoverPage />);
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
    renderWithProviders(<RecoverPage />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
