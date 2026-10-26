import type { FieldSpec } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import { LoginRecordFields } from "./login/LoginRecordFields";
import { RecordSubtitle } from "./RecordSubtitle";

const mocks = vi.hoisted(() => ({
  showTag: vi.fn(),
  previous: [] as FieldSpec[],
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useGetRecords: () => ({ records: [], ready: true }),
  usePasswordStrength: () => null,
  useStoredBreachCount: () => null,
  useMissingTwoFactor: () => undefined,
  usePreviousSecrets: () => ({ previous: mocks.previous }),
  useSortedRecords: () => ({ showTag: mocks.showTag }),
  useRecordVault: () => ({
    vault: { vaultId: "v1", name: "Koch Studio", role: "write", kind: "shared" },
    writable: true,
    showVault: true,
  }),
}));

vi.mock("@/features/vaults", () => ({ VaultTile: () => null }));

function makeLogin(fields: Partial<DecryptedRecord> = {}): DecryptedRecord {
  return {
    type: "login",
    title: "GitHub",
    username: "koch-studio-bot",
    password: "s3cret-pass",
    websites: [{ value: "https://github.com/login" }, { value: "gist.github.com" }],
    note: "Bot account for CI deploys.\nOrg owner: anna",
    customFields: [{ title: "Organisation", type: "text", value: "koch-studio" }],
    tags: ["work", "infra"],
    schemaVersion: 1,
    recordId: "r1",
    vaultId: "v1",
    version: 12,
    clientUpdatedAt: "2026-10-23T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: "2025-03-14T10:00:00.000Z",
    ...fields,
  } as DecryptedRecord;
}

beforeEach(() => {
  mocks.showTag.mockClear();
  mocks.previous = [];
});

describe("record detail", () => {
  it("lays the sections out in one column, in reading order", () => {
    mocks.previous = [
      {
        key: "password@3",
        group: "fields",
        compare: "old",
        kind: "secret",
        label: "Used until 12 Aug 2025",
        value: "old-pass",
      },
    ];
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Credentials",
      "Password health",
      "Websites2",
      "Note",
      "Extra fields1",
      "Previous passwords1",
    ]);
    expect(screen.getByText("Used until 12 Aug 2025")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Version history/ })).toHaveTextContent(
      "12 versions · last change",
    );
  });

  it("shows the copy shortcuts next to username and password", () => {
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    const username = screen.getByText("koch-studio-bot").closest("[data-slot='detail-field']");
    expect(within(username as HTMLElement).getByText(/U$/)).toHaveProperty("tagName", "KBD");
    const password = screen.getByText("Password").closest("[data-slot='detail-field']");
    expect(within(password as HTMLElement).getByText(/C$/)).toHaveProperty("tagName", "KBD");
  });

  it("keeps the password hidden until revealed", async () => {
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    expect(screen.queryByText("s3cret-pass")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("s3cret-pass")).toBeInTheDocument();
  });

  it("gives every website its own row with open and copy", () => {
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    expect(screen.getByRole("link", { name: "Open gist.github.com" })).toHaveAttribute(
      "href",
      "https://gist.github.com",
    );
    expect(screen.getAllByRole("button", { name: "Copy website" })).toHaveLength(2);
  });

  it("shows the note as a code block, line breaks kept, with its copy button", () => {
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    const note = screen.getByText(/Bot account for CI deploys/);
    expect(note.tagName).toBe("PRE");
    expect(note.textContent).toBe("Bot account for CI deploys.\nOrg owner: anna");
    expect(screen.getByRole("button", { name: "Copy note" })).toBeInTheDocument();
  });
});

describe("RecordSubtitle", () => {
  it("names the vault and type, and each tag filters the list", async () => {
    renderWithProviders(<RecordSubtitle record={makeLogin()} />);

    expect(screen.getByText("Koch Studio · Login")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show items tagged infra" }));
    expect(mocks.showTag).toHaveBeenCalledWith("infra");
  });
});
