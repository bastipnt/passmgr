import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { act, renderWithProviders, screen, within } from "@/test/render";
import EditRecordSheet from "./EditRecordSheet";

const mocks = vi.hoisted(() => ({
  mobile: false,
  deleteRecord: vi.fn(),
  handleSubmit: vi.fn(),
  record: undefined as unknown,
  /** The sheet's close after a save. */
  actionCb: undefined as undefined | (() => void),
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
  useRecordActions: ({ actionCb }: { actionCb?: () => void }) => {
    mocks.actionCb = actionCb;
    return {
      deleteRecord: mocks.deleteRecord,
      handleSubmit: mocks.handleSubmit,
      record: mocks.record,
      ready: true,
      updatePending: false,
    };
  },
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
      <EditRecordSheet />
    </Router>,
  );
  return location;
}

async function changeTitle() {
  await userEvent.type(screen.getByRole("textbox", { name: "Title" }), " Gold");
}

const discardQuestion = () => screen.queryByRole("dialog", { name: "Discard changes?" });
// The question is modal: the sheet behind it is hidden from the accessibility tree.
const titleBehindQuestion = () => screen.getByRole("textbox", { name: "Title", hidden: true });

beforeEach(() => {
  mocks.mobile = false;
  mocks.record = record;
  mocks.handleSubmit.mockImplementation(() => mocks.actionCb?.());
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

  it("renders nothing outside its route", () => {
    const location = memoryLocation({ path: "/record/r-1", record: true });
    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <EditRecordSheet />
      </Router>,
    );
    expect(screen.queryByRole("heading", { name: "Edit credit card" })).not.toBeInTheDocument();
  });

  describe("with unsaved changes", () => {
    it("asks before Cancel discards them; Keep editing keeps them", async () => {
      const location = renderEdit();
      await changeTitle();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(discardQuestion()).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      await vi.waitFor(() => expect(discardQuestion()).not.toBeInTheDocument());
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Visa Gold");
      expect(location.history.at(-1)).toBe("/record/r-1/edit");
    });

    it("closes on Discard", async () => {
      const location = renderEdit();
      await changeTitle();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      await vi.waitFor(() => expect(location.history.at(-1)).toBe("/record/r-1"));
    });

    it("asks on Esc", async () => {
      renderEdit();
      await changeTitle();

      await userEvent.keyboard("{Escape}");
      expect(discardQuestion()).toBeInTheDocument();
      expect(titleBehindQuestion()).toHaveValue("Visa Gold");
    });

    it("holds the sheet open on Back and returns to it on Keep editing", async () => {
      const location = renderEdit();
      await changeTitle();

      act(() => location.navigate("/record/r-1"));
      expect(discardQuestion()).toBeInTheDocument();
      expect(titleBehindQuestion()).toHaveValue("Visa Gold");

      await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(location.history.at(-1)).toBe("/record/r-1/edit");
      await vi.waitFor(() => expect(discardQuestion()).not.toBeInTheDocument());
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Visa Gold");
    });

    it("lets Back through on Discard", async () => {
      const location = renderEdit();
      await changeTitle();

      act(() => location.navigate("/record/r-1"));
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      await vi.waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Edit credit card" })).not.toBeInTheDocument(),
      );
      expect(location.history.at(-1)).toBe("/record/r-1");
    });

    it("saves without asking", async () => {
      const location = renderEdit();
      await changeTitle();

      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await vi.waitFor(() => expect(location.history.at(-1)).toBe("/record/r-1"));
      expect(mocks.handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Visa Gold" }),
      );
      expect(discardQuestion()).not.toBeInTheDocument();
    });

    it("starts over from the record when opened again", async () => {
      const location = renderEdit();
      await changeTitle();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      await vi.waitFor(() => expect(location.history.at(-1)).toBe("/record/r-1"));

      act(() => location.navigate("/record/r-1/edit"));
      expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Visa");
    });
  });

  it("closes an unchanged form without asking", async () => {
    const location = renderEdit();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(discardQuestion()).not.toBeInTheDocument();
    await vi.waitFor(() => expect(location.history.at(-1)).toBe("/record/r-1"));
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

    it("asks before the close button discards changes", async () => {
      renderEdit();
      await changeTitle();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(discardQuestion()).toBeInTheDocument();
    });

    it("labels the security code CVC, keeping its accessible name", () => {
      renderEdit();

      expect(screen.getByText("CVC")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Security code" })).toBeInTheDocument();
    });
  });
});
