import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import RecordForm, { type RecordFormHandle } from "./RecordForm";

vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));

const ROW_HEIGHT = 48;
const ROW_GAP = 8;

function renderLogin() {
  const onSubmit = vi.fn();
  const ref = createRef<RecordFormHandle>();
  renderWithProviders(
    <RecordForm
      type="login"
      onSubmit={onSubmit}
      ref={ref}
      defaultValues={{
        title: "GitHub",
        websites: [{ value: "https://github.com" }, { value: "https://gist.github.com" }],
        customFields: [
          { title: "Team", type: "text", value: "core" },
          { title: "PIN", type: "secret", value: "1234" },
          { title: "Org", type: "text", value: "acme" },
        ],
      }}
    />,
  );
  const submitted = async () => {
    ref.current?.triggerSubmit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    return onSubmit.mock.calls[0]?.[0];
  };
  return { submitted };
}

/** jsdom lays nothing out: stack the sortable rows (a handle's row's siblings) in a column. */
function stackRows() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
    return new DOMRect(0, index * (ROW_HEIGHT + ROW_GAP), 300, ROW_HEIGHT);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("RecordForm reorder", () => {
  it("moves a website down with the keyboard and announces it", async () => {
    const { submitted } = renderLogin();

    const handle = screen.getByRole("button", { name: "Move https://github.com" });
    handle.focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByText("https://github.com moved to position 2 of 2")).toHaveRole("status");
    expect(screen.getByRole("button", { name: "Move https://github.com" })).toHaveFocus();
    expect((await submitted()).websites).toEqual([
      { value: "https://gist.github.com" },
      { value: "https://github.com" },
    ]);
  });

  it("moves an extra field up with the keyboard, keeping its type", async () => {
    const { submitted } = renderLogin();

    screen.getByRole("button", { name: "Move PIN" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{ArrowUp}");

    expect((await submitted()).customFields).toEqual([
      { title: "PIN", type: "secret", value: "1234" },
      { title: "Team", type: "text", value: "core" },
      { title: "Org", type: "text", value: "acme" },
    ]);
  });

  it("moves an extra field by dragging its handle", async () => {
    stackRows();
    const { submitted } = renderLogin();

    const handle = screen.getByRole("button", { name: "Move Team" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 24 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 24 + 2 * 56 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect((await submitted()).customFields.map((field: { title: string }) => field.title)).toEqual(
      ["PIN", "Org", "Team"],
    );
  });

  it("drops a drag that the browser cancels", async () => {
    stackRows();
    const { submitted } = renderLogin();

    const handle = screen.getByRole("button", { name: "Move Team" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 24 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 24 + 56 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect((await submitted()).customFields.map((field: { title: string }) => field.title)).toEqual(
      ["Team", "PIN", "Org"],
    );
  });

  it("removes an empty website at once and asks before removing a filled one", async () => {
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Add website" }));
    expect(screen.getAllByRole("button", { name: "Remove website" })).toHaveLength(3);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove website" })[2]!);
    expect(screen.getAllByRole("button", { name: "Remove website" })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole("button", { name: "Remove website" })[0]!);
    expect(await screen.findByRole("dialog")).toHaveTextContent("delete this website");
  });
});
