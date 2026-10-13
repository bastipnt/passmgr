import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { FavoriteButton } from "./RecordActions";

const mocks = vi.hoisted(() => ({
  updateRecord: vi.fn(),
  role: "write",
}));

vi.mock("@repo/client/src/hooks/use-update-record", () => ({
  useUpdateRecord: () => ({ updateRecord: mocks.updateRecord, updatePending: false }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-vaults")>()),
  useVaults: () => ({
    getVault: (vaultId: string) => ({ vaultId, name: "Team", role: mocks.role }),
    hasSeveralVaults: true,
    writableVaults: [],
  }),
}));

function makeRecord(favorite?: boolean): DecryptedRecord {
  return {
    type: "login",
    title: "GitHub",
    username: "octo",
    ...(favorite === undefined ? {} : { favorite }),
    schemaVersion: 1,
    recordId: "r1",
    vaultId: "v1",
    version: 3,
    clientUpdatedAt: "2026-10-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

beforeEach(() => {
  mocks.updateRecord.mockClear();
  mocks.role = "write";
});

describe("FavoriteButton", () => {
  it("stars a record as a new version with favorite set", async () => {
    const record = makeRecord();
    renderWithProviders(<FavoriteButton record={record} />);

    const button = screen.getByRole("button", { name: "Add to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);

    expect(mocks.updateRecord).toHaveBeenCalledWith(record, {
      type: "login",
      title: "GitHub",
      username: "octo",
      favorite: true,
    });
  });

  it("unstars a record by dropping the key", async () => {
    const record = makeRecord(true);
    renderWithProviders(<FavoriteButton record={record} />);

    const button = screen.getByRole("button", { name: "Remove from favorites" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);

    const [, data] = mocks.updateRecord.mock.calls[0] ?? [];
    expect(data).toEqual({ type: "login", title: "GitHub", username: "octo" });
    expect(data).not.toHaveProperty("favorite");
  });

  it("shows a read member the star of a starred record, with nothing to press", () => {
    mocks.role = "read";
    renderWithProviders(<FavoriteButton record={makeRecord(true)} />);

    expect(screen.getByText("Favorite")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a read member nothing for an unstarred record", () => {
    mocks.role = "read";
    renderWithProviders(<FavoriteButton record={makeRecord()} />);

    expect(screen.queryByText("Favorite")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
