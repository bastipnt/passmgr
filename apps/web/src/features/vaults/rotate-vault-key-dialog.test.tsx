import { VaultRotationUnavailableError } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { RotateVaultKeyDialog } from "./RotateVaultKeyDialog";

const mocks = vi.hoisted(() => ({ rotateVaultKey: vi.fn() }));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useVaultActions: () => ({ rotateVaultKey: mocks.rotateVaultKey, pending: false }),
}));

const work = { vaultId: "v-work", name: "Work", kind: "shared", role: "owner" } as const;

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.rotateVaultKey.mockReset();
});

describe("RotateVaultKeyDialog", () => {
  it("rotates the vault's key and closes", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<RotateVaultKeyDialog vault={work} open onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Rotate key" }));

    expect(mocks.rotateVaultKey).toHaveBeenCalledWith("v-work");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open with the reason when the vault is shared with others", async () => {
    mocks.rotateVaultKey.mockImplementation(async () => {
      throw new VaultRotationUnavailableError();
    });
    const onOpenChange = vi.fn();
    renderWithProviders(<RotateVaultKeyDialog vault={work} open onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Rotate key" }));

    expect(await screen.findByText(/shared with others/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
