import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen, within } from "@/test/render";
import EditRecordSheet from "./EditRecordSheet";

const mocks = vi.hoisted(() => ({
  mobile: false,
  deleteRecord: vi.fn(),
  handleSubmit: vi.fn(),
}));

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => mocks.mobile,
  isMobile: () => mocks.mobile,
}));
vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));
vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useRecordVault: () => ({ writable: true }),
}));
vi.mock("./use-record-actions", () => ({
  useRecordActions: () => ({
    deleteRecord: mocks.deleteRecord,
    handleSubmit: mocks.handleSubmit,
    updatePending: false,
  }),
}));

const record = {
  recordId: "r-1",
  vaultId: "v-1",
  type: "card",
  title: "Visa",
  clientUpdatedAt: "2026-10-26T12:00:00Z",
} as DecryptedRecord;

function renderEdit() {
  const location = memoryLocation({ path: "/record/r-1/edit", record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <EditRecordSheet record={record} />
    </Router>,
  );
}

beforeEach(() => {
  mocks.mobile = false;
  mocks.deleteRecord.mockClear();
  mocks.handleSubmit.mockClear();
});

describe("EditRecordSheet", () => {
  it("keeps Delete and Save changes in the desktop footer", () => {
    renderEdit();

    expect(screen.getByRole("heading", { name: "Edit credit card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Security code" })).toBeInTheDocument();
  });

  describe("on a phone", () => {
    beforeEach(() => {
      mocks.mobile = true;
    });

    it("saves from the page bar", async () => {
      renderEdit();

      expect(screen.getByRole("heading", { name: "Edit credit card" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await vi.waitFor(() => expect(mocks.handleSubmit).toHaveBeenCalled());
    });

    it("shows the record under the bar and Delete at the end of the form", async () => {
      renderEdit();
      const form = screen.getByRole("textbox", { name: "Title" }).closest("form") as HTMLElement;

      expect(within(form).getByText("Visa")).toBeInTheDocument();
      expect(within(form).getByText(/^Last changed/)).toBeInTheDocument();
      expect(within(form).getByText("Every save keeps a version")).toBeInTheDocument();

      await userEvent.click(within(form).getByRole("button", { name: "Delete credit card" }));
      await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
      expect(mocks.deleteRecord).toHaveBeenCalledWith("r-1");
    });

    it("labels the security code CVC, keeping its accessible name", () => {
      renderEdit();

      expect(screen.getByText("CVC")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Security code" })).toBeInTheDocument();
    });
  });
});
