import { VaultsOfflineError } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { DeleteVaultDialog } from "./DeleteVaultDialog";

const mocks = vi.hoisted(() => ({ deleteVault: vi.fn() }));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useVaultActions: () => ({ deleteVault: mocks.deleteVault, pending: false }),
  useGetRecords: () => ({
    records: [{ vaultId: "v-work" }, { vaultId: "v-work" }, { vaultId: "v-personal" }],
  }),
}));

const work = { vaultId: "v-work", name: "Work", kind: "shared", role: "owner" } as const;

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.deleteVault.mockReset();
});

describe("DeleteVaultDialog", () => {
  it("deletes only once the vault's name is typed", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<DeleteVaultDialog vault={work} open onOpenChange={onOpenChange} />);

    expect(screen.getByText(/Its 2 items and their history/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Delete vault" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Type the vault's name/), "Wor");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type the vault's name/), "k");
    await userEvent.click(submit);

    expect(mocks.deleteVault).toHaveBeenCalledWith("v-work");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open with the reason when the vault can't be deleted offline", async () => {
    mocks.deleteVault.mockImplementation(async () => {
      throw new VaultsOfflineError();
    });
    const onOpenChange = vi.fn();
    renderWithProviders(<DeleteVaultDialog vault={work} open onOpenChange={onOpenChange} />);

    await userEvent.type(screen.getByLabelText(/Type the vault's name/), "Work");
    await userEvent.click(screen.getByRole("button", { name: "Delete vault" }));

    expect(await screen.findByText(/Connect to the server/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
