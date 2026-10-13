import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import type { RecordFormHandle } from "./RecordForm";
import TypedRecordForm from "./TypedRecordForm";

// The tag field offers the tags in use, which live in the records context.
vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));

describe("TypedRecordForm", () => {
  it("groups a card number while typing and names the network", async () => {
    renderWithProviders(<TypedRecordForm type="card" onSubmit={vi.fn()} />);

    const number = screen.getByLabelText("Card number") as HTMLInputElement;
    await userEvent.type(number, "4111111111111111");

    expect(number.value).toBe("4111 1111 1111 1111");
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });

  it("flags a card number that fails the checksum", async () => {
    renderWithProviders(<TypedRecordForm type="card" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Card number"), "4111111111111112");

    expect(screen.getByText(/doesn't look right/)).toBeInTheDocument();
  });

  it("types the expiry slash and rejects an invalid month", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<TypedRecordForm type="card" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Title"), "Visa");
    const expiry = screen.getByLabelText("Expiry date") as HTMLInputElement;
    await userEvent.type(expiry, "1329");
    expect(expiry.value).toBe("13/29");

    ref.current?.triggerSubmit();
    expect(await screen.findByText("Use MM/YY")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the type's own fields", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<TypedRecordForm type="api_key" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Title"), "Stripe");
    await userEvent.type(screen.getByLabelText("Key ID"), "pk_test");
    await userEvent.type(screen.getByLabelText("Secret"), "sk_test");

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Stripe", keyId: "pk_test", secret: "sk_test" }),
      ),
    );
  });

  it("adds typed tags as chips (a comma or Enter) and submits them", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<TypedRecordForm type="note" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Title"), "Wi-Fi codes");
    const tags = screen.getByLabelText("Tags");
    await userEvent.type(tags, "home,");
    await userEvent.type(tags, "  Family {Enter}");
    expect(screen.getByRole("button", { name: "Remove home" })).toBeInTheDocument();

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Wi-Fi codes", tags: ["home", "Family"] }),
      ),
    );
  });

  it("keeps a typed tag when the field is left without Enter", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<TypedRecordForm type="note" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Tags"), "work");
    await userEvent.type(screen.getByLabelText("Title"), "Notes");

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ["work"] })),
    );
  });

  it("masks secrets without type=password", () => {
    renderWithProviders(<TypedRecordForm type="card" onSubmit={vi.fn()} />);

    const pin = screen.getByLabelText("PIN") as HTMLInputElement;
    expect(pin.type).toBe("text");
    expect(pin.className).toContain("[-webkit-text-security:disc]");
  });

  it("generates an SSH key into the form", async () => {
    renderWithProviders(<TypedRecordForm type="ssh_key" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Title"), "Work laptop");
    await userEvent.click(screen.getByRole("button", { name: "Generate key" }));

    expect((screen.getByLabelText("Public key") as HTMLTextAreaElement).value).toMatch(
      /^ssh-ed25519 \S+$/,
    );
    expect((screen.getByLabelText("Private key") as HTMLTextAreaElement).value).toMatch(
      /^-----BEGIN OPENSSH PRIVATE KEY-----/,
    );
    expect(screen.getByText(/^SHA256:/)).toBeInTheDocument();
  });

  it("puts a secure note's body right under the title", () => {
    renderWithProviders(<TypedRecordForm type="note" onSubmit={vi.fn()} />);

    const labels = screen.getAllByText(/^(Title|Note)$/).map((el) => el.textContent);
    expect(labels).toEqual(["Title", "Note"]);
  });
});
