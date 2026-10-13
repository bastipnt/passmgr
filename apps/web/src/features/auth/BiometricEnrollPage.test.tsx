import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import BiometricEnrollPage from "./BiometricEnrollPage";

const navigate = vi.fn();
const setBiometricDismissed = vi.fn();
const enroll = vi.fn();
const dismiss = vi.fn();

vi.mock("@repo/client", () => ({
  useEnrollBiometric: () => ({ enroll, dismiss }),
  useStore: () => ({ setBiometricDismissed }),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/", navigate] };
});

describe("BiometricEnrollPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enrolls and navigates to /", async () => {
    enroll.mockResolvedValue(undefined);

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(setBiometricDismissed).toHaveBeenCalledWith(false);
  });

  it("renders an error and stays when enrolling fails", async () => {
    enroll.mockRejectedValue(new Error("PRF not supported"));

    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^enable$/i }));

    expect(await screen.findByText(/using fingerprint to unlock failed/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Skip dismisses the prompt and navigates", async () => {
    renderWithProviders(<BiometricEnrollPage />);
    await userEvent.click(screen.getByRole("button", { name: /^skip$/i }));

    expect(dismiss).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
