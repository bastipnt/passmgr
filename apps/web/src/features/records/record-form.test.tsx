import { RECORD_FORM_FIELDS } from "@repo/client";
import { RECORD_TYPES } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RecordForm, { type RecordFormHandle } from "./RecordForm";

// The tag field offers the tags in use, which live in the records context.
vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));

describe("RecordForm", () => {
  it.each(RECORD_TYPES)("renders the %s fields", (type) => {
    renderWithProviders(<RecordForm type={type} onSubmit={vi.fn()} />);

    for (const label of ["Title", ...RECORD_FORM_FIELDS[type].map((spec) => spec.label)]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Websites/ }) !== null).toBe(type === "login");
    expect(screen.queryByRole("combobox", { name: "Vault" })).not.toBeInTheDocument();
  });

  it("submits a login with its websites, extra fields and tags", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<RecordForm type="login" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Title"), "GitHub");
    await userEvent.type(screen.getByLabelText("Username"), "octocat");
    await userEvent.type(screen.getByLabelText("Email"), "octo@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await userEvent.type(screen.getByLabelText("2FA token secret (TOTP)"), "JBSWY3DPEHPK3PXP");
    await userEvent.type(screen.getByPlaceholderText("example.com"), "github.com");
    await userEvent.click(screen.getByRole("button", { name: "Add field" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Text" }));
    await userEvent.type(screen.getByPlaceholderText("Title"), "Team");
    await userEvent.type(screen.getByPlaceholderText("Value"), "core");
    await userEvent.type(screen.getByLabelText("Tags"), "dev{Enter}");

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "GitHub",
          username: "octocat",
          email: "octo@example.com",
          password: "hunter2hunter2",
          totp: "JBSWY3DPEHPK3PXP",
          websites: [{ value: expect.stringContaining("github.com") }],
          customFields: [expect.objectContaining({ title: "Team", value: "core", type: "text" })],
          tags: ["dev"],
        }),
      ),
    );
  });

  it("requires a title", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(
      <RecordForm type="login" onSubmit={onSubmit} ref={ref} defaultValues={{ title: "" }} />,
    );

    ref.current?.triggerSubmit();
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a malformed date of birth", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<RecordForm type="identity" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Title"), "Me");
    const birthDate = screen.getByLabelText("Date of birth") as HTMLInputElement;
    birthDate.type = "text";
    await userEvent.type(birthDate, "31.12.1990");

    ref.current?.triggerSubmit();
    expect(await screen.findByText("Use YYYY-MM-DD")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("masks the login password without type=password", () => {
    renderWithProviders(<RecordForm type="login" onSubmit={vi.fn()} />);

    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.className).toContain("[-webkit-text-security:disc]");
    expect(pw.type).toBe("text");
  });

  it("keeps browser autofill off on the form and every input", () => {
    const { container } = renderWithProviders(<RecordForm type="login" onSubmit={vi.fn()} />);

    expect(container.querySelector("form")?.getAttribute("autocomplete")).toBe("off");
    for (const input of document.querySelectorAll("input")) {
      const ac = input.getAttribute("autocomplete");
      expect(ac === null || ac === "off").toBe(true);
    }
    for (const label of ["Title", "Username", "Password"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).autocomplete).toBe("off");
    }
  });

  it("disables every field while a save is in flight", () => {
    const props = { type: "login" as const, onSubmit: vi.fn() };
    const { rerender } = renderWithProviders(<RecordForm {...props} disabled />);
    for (const input of document.querySelectorAll("input, textarea")) {
      expect(input).toBeDisabled();
    }

    rerender(<RecordForm {...props} disabled={false} />);
    expect(screen.getByLabelText("Title")).toBeEnabled();
  });

  it("groups a card number while typing and names the network", async () => {
    renderWithProviders(<RecordForm type="card" onSubmit={vi.fn()} />);

    const number = screen.getByLabelText("Card number") as HTMLInputElement;
    await userEvent.type(number, "4111111111111111");

    expect(number.value).toBe("4111 1111 1111 1111");
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });

  it("flags a card number that fails the checksum", async () => {
    renderWithProviders(<RecordForm type="card" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Card number"), "4111111111111112");

    expect(screen.getByText(/doesn't look right/)).toBeInTheDocument();
  });

  it("types the expiry slash and rejects an invalid month", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<RecordForm type="card" onSubmit={onSubmit} ref={ref} />);

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
    renderWithProviders(<RecordForm type="api_key" onSubmit={onSubmit} ref={ref} />);

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

  it("offers the vault field next to the tags when given one", () => {
    renderWithProviders(
      <RecordForm type="login" onSubmit={vi.fn()} vaultField={<span>Vault field</span>} />,
    );

    expect(screen.getByText("Vault field")).toBeInTheDocument();
  });

  it("opens with the type's section, then its own sections, extra fields and the note", () => {
    renderWithProviders(<RecordForm type="identity" onSubmit={vi.fn()} />);

    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Personal info",
      "Address",
      "Extra fields0",
      "Note",
    ]);
  });

  it("removes the last tag with Backspace in the empty tag field", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(
      <RecordForm
        type="note"
        onSubmit={onSubmit}
        ref={ref}
        defaultValues={{ title: "Codes", tags: ["home", "work"] }}
      />,
    );

    await userEvent.type(screen.getByLabelText("Tags"), "{Backspace}");
    expect(screen.queryByRole("button", { name: "Remove work" })).not.toBeInTheDocument();

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ["home"] })),
    );
  });

  it("adds typed tags (a comma or Enter) and submits them", async () => {
    const onSubmit = vi.fn();
    const ref = createRef<RecordFormHandle>();
    renderWithProviders(<RecordForm type="note" onSubmit={onSubmit} ref={ref} />);

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
    renderWithProviders(<RecordForm type="note" onSubmit={onSubmit} ref={ref} />);

    await userEvent.type(screen.getByLabelText("Tags"), "work");
    await userEvent.type(screen.getByLabelText("Title"), "Notes");

    ref.current?.triggerSubmit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ["work"] })),
    );
  });

  it("masks secrets without type=password", () => {
    renderWithProviders(<RecordForm type="card" onSubmit={vi.fn()} />);

    const pin = screen.getByLabelText("PIN") as HTMLInputElement;
    expect(pin.type).toBe("text");
    expect(pin.className).toContain("[-webkit-text-security:disc]");
  });

  it("generates an SSH key into the form", async () => {
    renderWithProviders(<RecordForm type="ssh_key" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Title"), "Work laptop");
    await userEvent.click(screen.getByRole("button", { name: "Generate new key" }));

    expect((screen.getByLabelText("Public key") as HTMLTextAreaElement).value).toMatch(
      /^ssh-ed25519 \S+$/,
    );
    expect((screen.getByLabelText("Private key") as HTMLTextAreaElement).value).toMatch(
      /^-----BEGIN OPENSSH PRIVATE KEY-----/,
    );
    expect(screen.getByText(/^SHA256:/)).toBeInTheDocument();
  });

  it("puts a secure note's body in its first section, with no note section below", () => {
    renderWithProviders(<RecordForm type="note" onSubmit={vi.fn()} />);

    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Note",
      "Extra fields0",
    ]);
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveAttribute("rows", "10");
  });
});
