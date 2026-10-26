import type { FieldSpec, PasswordHealthSummary } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import { LoginRecordFields } from "./login/LoginRecordFields";
import { RecordSubtitle } from "./RecordSubtitle";

const mocks = vi.hoisted(() => ({
  showTag: vi.fn(),
  previous: [] as FieldSpec[],
  health: null as PasswordHealthSummary | null,
  writable: true,
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useGetRecords: () => ({ records: [], ready: true }),
  usePasswordHealth: () => mocks.health,
  usePreviousSecrets: () => ({ previous: mocks.previous }),
  useSortedRecords: () => ({ showTag: mocks.showTag }),
  useRecordVault: () => ({
    vault: { vaultId: "v1", name: "Koch Studio", role: "write", kind: "shared" },
    writable: mocks.writable,
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
  mocks.health = null;
  mocks.writable = true;
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

describe("password health line", () => {
  const strong = { level: "very-strong", label: "Very strong" } as const;

  it("shows strength and a clean breach result, and no pill without issues", () => {
    mocks.health = { strength: strong, breachCount: 0, issues: [] };
    renderWithProviders(<LoginRecordFields record={makeLogin()} />);

    const line = document.querySelector("[data-slot='password-health']") as HTMLElement;
    expect(within(line).getByText("Very strong")).toBeInTheDocument();
    expect(within(line).getByText("Not breached")).toBeInTheDocument();
    expect(within(line).queryByRole("button")).not.toBeInTheDocument();
  });

  it("counts the issues in the pill and lists one row each when expanded", async () => {
    const sentry = makeLogin({ recordId: "r2", title: "Sentry" });
    mocks.health = {
      strength: strong,
      breachCount: null,
      issues: [
        { kind: "reused", records: [sentry] },
        { kind: "old", ageDays: 425 },
      ],
    };
    renderWithProviders(<LoginRecordFields record={makeLogin({ recordId: "pill" })} />);

    expect(screen.queryByText("Not breached")).not.toBeInTheDocument();
    const pill = screen.getByRole("button", { name: "2 issues" });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(pill);

    const rows = within(screen.getByRole("list", { name: "Password issues" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("The same password is saved in Sentry");
    expect(within(rows[0]!).getByRole("link", { name: "Show" })).toHaveAttribute(
      "href",
      "/record/r2",
    );
    expect(rows[1]).toHaveTextContent("Last changed 14 months ago");
    expect(within(rows[1]!).getByRole("link", { name: "Change" })).toHaveAttribute(
      "href",
      "/record/pill/edit",
    );
  });

  it("links the 2FA docs of a site that supports it", async () => {
    mocks.health = {
      strength: strong,
      breachCount: 3,
      issues: [
        { kind: "breached", count: 3 },
        {
          kind: "missing-two-factor",
          site: { domain: "github.com", documentation: "https://docs.github.com/2fa" },
        },
      ],
    };
    renderWithProviders(<LoginRecordFields record={makeLogin({ recordId: "tfa" })} />);

    await userEvent.click(screen.getByRole("button", { name: "2 issues" }));
    expect(screen.getByText("Seen 3 times in data breaches")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up" })).toHaveAttribute(
      "href",
      "https://docs.github.com/2fa",
    );
  });

  it("offers no edit to a read-only member, but still the docs", async () => {
    mocks.writable = false;
    mocks.health = {
      strength: strong,
      breachCount: null,
      issues: [
        { kind: "old", ageDays: 425 },
        { kind: "missing-two-factor", site: { domain: "github.com" } },
      ],
    };
    renderWithProviders(<LoginRecordFields record={makeLogin({ recordId: "ro" })} />);

    await userEvent.click(screen.getByRole("button", { name: "2 issues" }));
    expect(screen.queryByRole("link", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add code" })).not.toBeInTheDocument();
  });

  it("names two reusing records and counts the rest", async () => {
    const others = ["Sentry", "Figma", "Notion"].map((title, i) =>
      makeLogin({ recordId: `o${i}`, title }),
    );
    mocks.health = {
      strength: strong,
      breachCount: null,
      issues: [{ kind: "reused", records: others }],
    };
    renderWithProviders(<LoginRecordFields record={makeLogin({ recordId: "many" })} />);

    await userEvent.click(screen.getByRole("button", { name: "1 issue" }));
    expect(screen.getByText(/The same password is saved in/)).toHaveTextContent(
      "The same password is saved in Sentry, Figma +1",
    );
    expect(screen.queryByRole("link", { name: "Show" })).not.toBeInTheDocument();
  });

  it("keeps a record's issues open when it is shown again", async () => {
    mocks.health = { strength: strong, breachCount: null, issues: [{ kind: "old", ageDays: 800 }] };
    const { unmount } = renderWithProviders(
      <LoginRecordFields record={makeLogin({ recordId: "kept" })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "1 issue" }));
    unmount();

    renderWithProviders(<LoginRecordFields record={makeLogin({ recordId: "kept" })} />);
    expect(screen.getByText("Last changed 2 years ago")).toBeInTheDocument();
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
