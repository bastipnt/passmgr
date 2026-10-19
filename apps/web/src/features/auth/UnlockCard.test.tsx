import type { SecondFactorRequest } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import UnlockCard from "./UnlockCard";

const biometricUnlock = vi.fn();
vi.mock("@repo/client", () => ({
  useBiometricUnlock: () => ({ unlock: biometricUnlock }),
}));

const noSecondFactor = { request: null, submit: vi.fn(), cancel: vi.fn() };

function renderCard(props: Partial<Parameters<typeof UnlockCard>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <UnlockCard
      email="jana@example.com"
      biometrics={false}
      onSubmit={onSubmit}
      onSwitch={vi.fn()}
      loading={false}
      setLoading={vi.fn()}
      onEdit={vi.fn()}
      secondFactor={noSecondFactor}
      removeDescription="Remove it."
      onRemove={vi.fn()}
      {...props}
    />,
  );
  return { onSubmit };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UnlockCard", () => {
  it("shows the password field right away without biometrics", async () => {
    const { onSubmit } = renderCard();
    expect(screen.queryByRole("button", { name: /biometrics/i })).toBeNull();

    await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: /^unlock$/i }));
    expect(onSubmit).toHaveBeenCalledWith("hunter2hunter2");
  });

  it("offers biometrics first and the password on request", async () => {
    renderCard({ biometrics: true });
    expect(screen.getByRole("button", { name: "Unlock with biometrics" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Use password" }));
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("opens the password field when the biometric unlock fails", async () => {
    biometricUnlock.mockRejectedValueOnce(new Error("NotAllowedError"));
    renderCard({ biometrics: true });

    await userEvent.click(screen.getByRole("button", { name: "Unlock with biometrics" }));

    expect(await screen.findByText(/biometric unlock didn't work/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try biometrics again" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("swaps the actions for the code step, keeping the vault row", () => {
    const request = { invalid: false, verifying: false } as SecondFactorRequest;
    renderCard({ secondFactor: { ...noSecondFactor, request } });

    expect(screen.getByText("jana@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^switch$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove vault/i })).toBeNull();
  });
});
