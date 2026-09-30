import type { DecryptedRecord } from "@repo/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen } from "@/test/render";
import VersionsSheet from "./VersionsSheet";

const useRecordHistory = vi.hoisted(() => vi.fn());
const mobileMatch = vi.hoisted(() => vi.fn());

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useRecordHistory: () => useRecordHistory(),
}));

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => mobileMatch(),
  isMobile: () => mobileMatch(),
}));

function makeRecord(version: number): DecryptedRecord {
  return {
    schemaVersion: 1,
    recordId: "r1",
    version,
    title: "Example",
    clientUpdatedAt: `2026-0${version}-01T10:00:00.000Z`,
    created_at: null,
    firstCreatedAt: null,
  };
}

function renderAt(path: string) {
  const { hook } = memoryLocation({ path });
  return renderWithProviders(
    <Router hook={hook}>
      <VersionsSheet />
    </Router>,
  );
}

describe("VersionsSheet", () => {
  beforeEach(() => {
    useRecordHistory.mockReturnValue({
      versions: [makeRecord(3), makeRecord(2), makeRecord(1)],
      ready: true,
      error: undefined,
    });
  });

  describe.each([
    ["desktop", false],
    ["phone", true],
  ])("on %s", (_, mobile) => {
    beforeEach(() => {
      mobileMatch.mockReturnValue(mobile);
    });

    it("titles a version and links back to the list", () => {
      renderAt("/record/r1/versions/2");

      expect(screen.getByRole("dialog", { name: "Version 2" })).toBeInTheDocument();
      expect(screen.getByText("Changes since the previous version")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All versions" })).toHaveAttribute(
        "href",
        "/record/r1/versions",
      );
    });

    it("heads the two diff columns once", () => {
      renderAt("/record/r1/versions/2");

      expect(screen.getAllByText("Version 1")).toHaveLength(1);
      // Version 2 is also the sheet title; its column heading is the h3.
      expect(screen.getAllByRole("heading", { level: 3, name: "Version 2" })).toHaveLength(1);
    });

    it("titles the list without a back link", () => {
      renderAt("/record/r1/versions");

      expect(screen.getByRole("dialog", { name: "Version history" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "All versions" })).toBeNull();
    });

    it("falls back to the list for a malformed version", () => {
      renderAt("/record/r1/versions/abc");

      expect(screen.getByRole("dialog", { name: "Version history" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "All versions" })).toBeNull();
    });
  });
});
