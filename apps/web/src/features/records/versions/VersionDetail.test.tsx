import type { DecryptedRecord } from "@repo/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import VersionDetail from "./VersionDetail";

const useRecordHistory = vi.hoisted(() => vi.fn());

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useRecordHistory: () => useRecordHistory(),
}));

function makeRecord(version: number, fields: Partial<DecryptedRecord>): DecryptedRecord {
  return {
    schemaVersion: 1,
    recordId: "r1",
    version,
    title: "Example",
    clientUpdatedAt: `2026-0${version}-01T10:00:00.000Z`,
    created_at: null,
    firstCreatedAt: null,
    ...fields,
  };
}

/** The wrapper carrying the diff colours for a field, found by its title. */
function cellFor(title: string) {
  const heading = screen.getByText(title);
  const cell = heading.closest("[data-slot='item-group']");
  expect(cell).not.toBeNull();
  return cell as HTMLElement;
}

function cellsFor(title: string) {
  return screen
    .getAllByText(title)
    .map((node) => node.closest("[data-slot='item-group']") as HTMLElement);
}

describe("VersionDetail", () => {
  beforeEach(() => {
    useRecordHistory.mockReset();
  });

  function setup(old: DecryptedRecord, latest: DecryptedRecord) {
    useRecordHistory.mockReturnValue({ versions: [latest, old], ready: true, error: undefined });
    return renderWithProviders(<VersionDetail recordId="r1" version={old.version} />);
  }

  it("heads each side with its version and date", () => {
    setup(makeRecord(1, { username: "a" }), makeRecord(2, { username: "a" }));

    expect(screen.getByText("Version 1")).toBeTruthy();
    expect(screen.getByText("Current version")).toBeTruthy();
  });

  it("omits the date footer", () => {
    setup(makeRecord(1, { username: "a" }), makeRecord(2, { username: "a" }));

    expect(screen.queryByText(/Date last used/)).toBeNull();
    expect(screen.queryByText(/Date created/)).toBeNull();
    expect(screen.queryByText(/Date last changed/)).toBeNull();
  });

  it("gives an edited field a warning border on both sides", () => {
    setup(makeRecord(1, { username: "old@x" }), makeRecord(2, { username: "new@x" }));

    const [oldCell, latestCell] = cellsFor("Username");
    expect(oldCell!.className).toContain("border-warning");
    expect(latestCell!.className).toContain("border-warning");
  });

  it("labels the status and both sides so the stacked layout stays readable", () => {
    setup(makeRecord(1, { username: "old@x" }), makeRecord(2, { username: "new@x" }));

    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
  });

  it("leaves an unchanged field without a status or side label", () => {
    setup(makeRecord(1, { username: "same" }), makeRecord(2, { username: "same" }));

    expect(screen.queryByText("Changed")).toBeNull();
    expect(screen.queryByText("Before")).toBeNull();
    expect(screen.queryByText("Now")).toBeNull();
  });

  it("leaves an unchanged field with no status colour", () => {
    setup(makeRecord(1, { username: "same" }), makeRecord(2, { username: "same" }));

    for (const cell of cellsFor("Username")) {
      expect(cell.className).not.toMatch(/border-(warning|success|error)/);
    }
  });

  it("marks an added field green and leaves the old side empty", () => {
    setup(makeRecord(1, {}), makeRecord(2, { note: "hello" }));

    const cell = cellFor("Notes");
    expect(cell.className).toContain("border-success");
    expect(cell.className).toContain("bg-success/10");
    // Only the latest side rendered the field.
    expect(screen.getAllByText("Notes")).toHaveLength(1);
    expect(screen.getByText("Added")).toBeTruthy();
  });

  it("marks a removed field red and leaves the latest side empty", () => {
    setup(makeRecord(1, { websites: [{ value: "https://example.com" }] }), makeRecord(2, {}));

    const cell = cellFor("Websites");
    expect(cell.className).toContain("border-error");
    expect(cell.className).toContain("bg-error/10");
    expect(screen.getAllByText("Websites")).toHaveLength(1);
    expect(screen.getByText("Removed")).toBeTruthy();
  });

  it("shows the title so renames are visible", () => {
    // Not "Before"/"After" — those collide with the stacked layout's captions.
    setup(makeRecord(1, { title: "Old name" }), makeRecord(2, { title: "New name" }));

    expect(screen.getByText("Old name")).toBeTruthy();
    expect(screen.getByText("New name")).toBeTruthy();
    for (const cell of cellsFor("Title")) {
      expect(cell.className).toContain("border-warning");
    }
  });

  it("keeps both sides on the same row when one lacks a field", () => {
    const { container } = setup(makeRecord(1, {}), makeRecord(2, { note: "hello" }));

    // The old side still occupies its grid slot, so Notes cannot slide up into
    // the row above it.
    const placeholders = container.querySelectorAll("[aria-hidden='true'].hidden");
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
