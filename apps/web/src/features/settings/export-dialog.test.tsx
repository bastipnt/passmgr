import type { ExportResult } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import ExportDialog from "./ExportDialog";

const exportHook = vi.hoisted(() => ({
  createExport: vi.fn(),
  markSaved: vi.fn(async () => undefined),
  exporting: false,
  exportError: undefined as "wrong_password" | "failed" | undefined,
  clearExportError: vi.fn(),
}));
vi.mock("@repo/client/src/hooks/use-export", async (importActual) => ({
  ...(await importActual<object>()),
  useExport: () => exportHook,
}));

const RESULT: ExportResult = {
  fileName: "passmgr-backup-2026-10-08.json",
  mimeType: "application/json",
  content: "{}",
  format: "encrypted",
  profileId: "p-local",
  skipped: 0,
};

const click = vi.fn();

beforeEach(() => {
  exportHook.exportError = undefined;
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});
afterEach(() => vi.clearAllMocks());

// Pasted, not typed: the strength meter rates every keystroke, too slow under a parallel run.
async function fill(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.click(screen.getByLabelText(label));
  await user.paste(value);
}

function renderDialog() {
  renderWithProviders(
    <ExportDialog>
      <Button>Export</Button>
    </ExportDialog>,
  );
}

describe("ExportDialog", () => {
  it("exports an encrypted backup, downloads it and marks it saved", async () => {
    exportHook.createExport.mockResolvedValue(RESULT);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await fill(user, "passmgr password", "master");
    await fill(user, "Backup password", "backup password");
    await fill(user, "Confirm backup password", "backup password");
    await user.click(screen.getByRole("button", { name: "Export backup" }));

    await waitFor(() => expect(exportHook.markSaved).toHaveBeenCalledWith(RESULT));
    expect(exportHook.createExport).toHaveBeenCalledWith({
      format: "encrypted",
      masterPassword: "master",
      exportPassword: "backup password",
    });
    expect(click).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("doesn't export an encrypted backup without the password", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await fill(user, "Backup password", "backup password");
    await fill(user, "Confirm backup password", "backup password");
    await user.click(screen.getByRole("button", { name: "Export backup" }));

    expect(await screen.findByText("Enter your passmgr password")).toBeTruthy();
    expect(exportHook.createExport).not.toHaveBeenCalled();
  });

  it("doesn't export with mismatched backup passwords", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await fill(user, "passmgr password", "master");
    await fill(user, "Backup password", "backup password");
    await fill(user, "Confirm backup password", "something else");
    await user.click(screen.getByRole("button", { name: "Export backup" }));

    expect(await screen.findByText("Passwords do not match")).toBeTruthy();
    expect(exportHook.createExport).not.toHaveBeenCalled();
  });

  it("warns before a plain export and asks for the password", async () => {
    exportHook.createExport.mockResolvedValue(null);
    exportHook.exportError = "wrong_password";
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(await screen.findByRole("option", { name: "Unencrypted CSV" }));

    expect(screen.getByText(/This file is not encrypted/)).toBeTruthy();
    expect(screen.getByText("That's not your passmgr password.")).toBeTruthy();
    await fill(user, "passmgr password", "master");
    await user.click(screen.getByRole("button", { name: "Export unencrypted" }));

    await waitFor(() =>
      expect(exportHook.createExport).toHaveBeenCalledWith({
        format: "csv",
        masterPassword: "master",
      }),
    );
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
