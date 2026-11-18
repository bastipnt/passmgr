import { SessionContext } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import VaultsSettingsPage from "./VaultsSettingsPage";

const records = vi.hoisted(
  () =>
    [
      { recordId: "a", vaultId: "personal" },
      { recordId: "b", vaultId: "personal" },
      { recordId: "c", vaultId: "studio" },
    ] as DecryptedRecord[],
);
vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));
const vaults = vi.hoisted(() => [
  { vaultId: "personal", name: "Personal", kind: "personal", role: "owner" },
  { vaultId: "studio", name: "Koch Studio", kind: "shared", role: "owner" },
  { vaultId: "family", name: "Family", kind: "shared", role: "read" },
]);
vi.mock("@repo/client/src/hooks/use-vaults", async (importActual) => ({
  ...(await importActual<object>()),
  useVaults: () => ({ vaults }),
  useVaultActions: () => ({ canChangeVaults: true }),
}));
vi.mock("@repo/client/src/vaults/vault-labels", async (importActual) => ({
  ...(await importActual<object>()),
  ownFingerprint: () => "78407 33067 12225 19531 90557 48608",
}));
// The dialogs have their own tests; here only which one opens for which vault.
vi.mock("@/features/vaults", () => {
  const dialog =
    (name: string) =>
    ({ open, vault }: { open: boolean; vault?: { name: string } }) =>
      open ? <dialog open aria-label={`${name} ${vault?.name ?? "new"}`} /> : null;
  return {
    VaultTile: () => <span />,
    VaultInvitations: () => null,
    RevokedVaults: () => null,
    VaultDialog: dialog("Edit"),
    DeleteVaultDialog: dialog("Delete"),
    RotateVaultKeyDialog: dialog("Rotate"),
    VaultMembersDialog: dialog("Members"),
  };
});
vi.mock("./CreateAccountDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <dialog open aria-label="Create online account" /> : null,
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));

function renderVaults(mode: "online" | "local" = "online") {
  const session = { mode } as ContextType<typeof SessionContext>;
  return renderWithProviders(
    <SessionContext.Provider value={session}>
      <VaultsSettingsPage />
    </SessionContext.Provider>,
  );
}

afterEach(() => {
  viewport.mobile = false;
});

describe("VaultsSettingsPage", () => {
  it("lists the vaults with Members on shared ones and the rest in a ⋯ menu", async () => {
    renderVaults();

    const list = screen.getByRole("list", { name: "Your vaults" });
    const [personal, studio, family] = within(list).getAllByRole("listitem");
    expect(personal).toHaveTextContent("2 items · only you");
    expect(personal).toHaveTextContent("Default for new items");
    expect(within(personal!).queryByRole("button", { name: /Members/ })).toBeNull();
    expect(studio).toHaveTextContent("1 item · you own it");
    expect(family).toHaveTextContent("0 items · read only");
    // A read-only member has no Edit, Rotate key or Delete.
    expect(within(family!).queryByRole("button", { name: /More actions/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "More actions for Personal" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Edit",
      "Rotate key",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Rotate key" }));
    expect(await screen.findByRole("dialog", { name: "Rotate Personal" })).toBeInTheDocument();
  });

  it("opens a shared vault's members and offers deleting it to its owner", async () => {
    renderVaults();

    await userEvent.click(screen.getByRole("button", { name: "Members of Koch Studio" }));
    expect(await screen.findByRole("dialog", { name: "Members Koch Studio" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions for Koch Studio" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete Koch Studio" })).toBeInTheDocument();
  });

  it("shows the security code with Copy", () => {
    renderVaults();

    const code = screen.getByRole("region", { name: "Your security code" });
    expect(code).toHaveTextContent("78407 33067 12225 19531 90557 48608");
    expect(within(code).getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("opens a vault's actions in a sheet on a phone", async () => {
    viewport.mobile = true;
    renderVaults();

    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Koch Studio" }));
    const sheet = await screen.findByRole("dialog", { name: "Koch Studio" });
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((text) => text && ["Members", "Edit", "Rotate key", "Delete"].includes(text)),
    ).toEqual(["Members", "Edit", "Rotate key", "Delete"]);

    await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Delete Koch Studio" })).toBeInTheDocument(),
    );
  });

  it("offers a local profile an online account to share a vault, and no security code", async () => {
    renderVaults("local");

    expect(screen.queryByRole("region", { name: "Your security code" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Share Koch Studio" }));
    expect(
      await screen.findByRole("dialog", { name: "Create online account" }),
    ).toBeInTheDocument();
  });
});
