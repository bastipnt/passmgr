// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteVaultSummary,
  useDeleteVault,
  useRotateVaultKey,
  useVaultForm,
  VAULT_DELETE_FAILED_MESSAGE,
  VAULT_NAME_INVALID_MESSAGE,
  VAULT_ROTATE_FAILED_MESSAGE,
  VAULT_SAVE_FAILED_MESSAGE,
} from "../src/hooks/use-vault-settings";
import { VaultsOfflineError } from "../src/hooks/use-vaults";
import type { VaultInfo } from "../src/vaults/vault-info";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => void)[] = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
});

/** Renders `hook` in a component; `current` is its latest result. */
function renderHook<T>(hook: () => T): { readonly current: T } {
  const result = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  unmounts.push(() => root.unmount());
  return result;
}

const work: VaultInfo = {
  vaultId: "v-work",
  name: "Work",
  icon: "briefcase",
  color: "teal",
  kind: "shared",
  role: "owner",
};

describe("useVaultForm", () => {
  it("starts a new vault with the default icon and colour", () => {
    const result = renderHook(() =>
      useVaultForm({ actions: { createVault: vi.fn(), renameVault: vi.fn() }, onSaved: vi.fn() }),
    );
    expect(result.current).toMatchObject({ name: "", icon: "vault", color: "violet" });
  });

  it("starts an edit with the vault's name, icon and colour", () => {
    const result = renderHook(() =>
      useVaultForm({
        vault: work,
        actions: { createVault: vi.fn(), renameVault: vi.fn() },
        onSaved: vi.fn(),
      }),
    );
    expect(result.current).toMatchObject({ name: "Work", icon: "briefcase", color: "teal" });
  });

  it("refuses an empty name without calling the server", async () => {
    const actions = { createVault: vi.fn(), renameVault: vi.fn() };
    const onSaved = vi.fn();
    const result = renderHook(() => useVaultForm({ actions, onSaved }));

    await act(() => result.current.save());

    expect(result.current.error).toBe(VAULT_NAME_INVALID_MESSAGE);
    expect(actions.createVault).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("creates a vault and hands its id on", async () => {
    const actions = { createVault: vi.fn(async () => "v-new"), renameVault: vi.fn() };
    const onSaved = vi.fn();
    const result = renderHook(() => useVaultForm({ actions, onSaved }));

    act(() => {
      result.current.setName("Family");
      result.current.setIcon("home");
      result.current.setColor("rose");
    });
    await act(() => result.current.save());

    expect(actions.createVault).toHaveBeenCalledWith({
      name: "Family",
      icon: "home",
      color: "rose",
    });
    expect(onSaved).toHaveBeenCalledWith({ vaultId: "v-new", name: "Family", created: true });
    expect(result.current.error).toBeUndefined();
  });

  it("renames the vault it edits", async () => {
    const actions = { createVault: vi.fn(), renameVault: vi.fn(async () => undefined) };
    const onSaved = vi.fn();
    const result = renderHook(() => useVaultForm({ vault: work, actions, onSaved }));

    act(() => result.current.setName("Job"));
    await act(() => result.current.save());

    expect(actions.renameVault).toHaveBeenCalledWith("v-work", {
      name: "Job",
      icon: "briefcase",
      color: "teal",
    });
    expect(onSaved).toHaveBeenCalledWith({ vaultId: "v-work", name: "Job", created: false });
    expect(actions.createVault).not.toHaveBeenCalled();
  });

  it("keeps a failure's reason, or says the save failed", async () => {
    const actions = {
      createVault: vi.fn(),
      renameVault: vi
        .fn()
        .mockRejectedValueOnce(new VaultsOfflineError())
        .mockRejectedValueOnce(new Error("boom")),
    };
    const onSaved = vi.fn();
    const result = renderHook(() => useVaultForm({ vault: work, actions, onSaved }));

    await act(() => result.current.save());
    expect(result.current.error).toBe(new VaultsOfflineError().message);
    await act(() => result.current.save());
    expect(result.current.error).toBe(VAULT_SAVE_FAILED_MESSAGE);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("useRotateVaultKey", () => {
  it("rotates the vault's key, then calls onRotated", async () => {
    const actions = { rotateVaultKey: vi.fn(async () => undefined) };
    const onRotated = vi.fn();
    const result = renderHook(() => useRotateVaultKey({ vault: work, actions, onRotated }));

    await act(() => result.current.rotate());

    expect(actions.rotateVaultKey).toHaveBeenCalledWith("v-work");
    expect(onRotated).toHaveBeenCalledOnce();
  });

  it("keeps the failure until the next try or clearError", async () => {
    const actions = {
      rotateVaultKey: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementationOnce(() => new Promise(() => {})),
    };
    const onRotated = vi.fn();
    const result = renderHook(() => useRotateVaultKey({ vault: work, actions, onRotated }));

    await act(() => result.current.rotate());
    expect(result.current.error).toBe(VAULT_ROTATE_FAILED_MESSAGE);
    act(() => result.current.clearError());
    expect(result.current.error).toBeUndefined();

    await act(() => result.current.rotate());
    expect(result.current.error).toBe(VAULT_ROTATE_FAILED_MESSAGE);
    act(() => void result.current.rotate());
    expect(result.current.error).toBeUndefined();
    expect(onRotated).not.toHaveBeenCalled();
  });
});

describe("useDeleteVault", () => {
  const records = [{ vaultId: "v-work" }, { vaultId: "v-work" }, { vaultId: "v-personal" }];

  it("counts the vault's items", () => {
    const result = renderHook(() =>
      useDeleteVault({
        vault: work,
        actions: { deleteVault: vi.fn() },
        records,
        onDeleted: vi.fn(),
      }),
    );
    expect(result.current.count).toBe(2);
    expect(result.current.summary).toBe(deleteVaultSummary(2));
    expect(deleteVaultSummary(1)).toMatch(/^Its 1 item and their history/);
    expect(deleteVaultSummary(2)).toMatch(/^Its 2 items and their history/);
  });

  it("deletes only once the vault's name is typed", async () => {
    const actions = { deleteVault: vi.fn(async () => undefined) };
    const onDeleted = vi.fn();
    const result = renderHook(() => useDeleteVault({ vault: work, actions, records, onDeleted }));

    act(() => result.current.setTyped("Wor"));
    expect(result.current.confirmed).toBe(false);
    await act(() => result.current.remove());
    expect(actions.deleteVault).not.toHaveBeenCalled();

    act(() => result.current.setTyped(" Work "));
    expect(result.current.confirmed).toBe(true);
    await act(() => result.current.remove());
    expect(actions.deleteVault).toHaveBeenCalledWith("v-work");
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("keeps a failure's reason, or says the delete failed; reset clears it", async () => {
    const actions = {
      deleteVault: vi
        .fn()
        .mockRejectedValueOnce(new VaultsOfflineError())
        .mockRejectedValueOnce(new Error("boom")),
    };
    const onDeleted = vi.fn();
    const result = renderHook(() => useDeleteVault({ vault: work, actions, records, onDeleted }));

    act(() => result.current.setTyped("Work"));
    await act(() => result.current.remove());
    expect(result.current.error).toBe(new VaultsOfflineError().message);
    await act(() => result.current.remove());
    expect(result.current.error).toBe(VAULT_DELETE_FAILED_MESSAGE);
    expect(onDeleted).not.toHaveBeenCalled();

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ typed: "", error: undefined, confirmed: false });
  });
});
