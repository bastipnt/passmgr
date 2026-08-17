import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import LoginRecordForm from "./LoginRecordForm";

describe("LoginRecordForm", () => {
  it("masks the password field via -webkit-text-security:disc", () => {
    renderWithProviders(<LoginRecordForm onSubmit={vi.fn()} action="Save" onCancel={vi.fn()} />);
    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.className).toContain("[-webkit-text-security:disc]");
    expect(pw.type).toBe("text");
  });

  it("the form has autoComplete=off", () => {
    const { container } = renderWithProviders(
      <LoginRecordForm onSubmit={vi.fn()} action="Save" onCancel={vi.fn()} />,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("autocomplete")).toBe("off");
  });

  it("controlled inputs declare autoComplete=off", () => {
    renderWithProviders(<LoginRecordForm onSubmit={vi.fn()} action="Save" onCancel={vi.fn()} />);

    expect((screen.getByLabelText("Title") as HTMLInputElement).autocomplete).toBe("off");
    expect((screen.getByLabelText("Username") as HTMLInputElement).autocomplete).toBe("off");
    expect((screen.getByLabelText("Password") as HTMLInputElement).autocomplete).toBe("off");
  });

  it("does not render any field with autocomplete=on (no browser autofill)", () => {
    renderWithProviders(<LoginRecordForm onSubmit={vi.fn()} action="Save" onCancel={vi.fn()} />);
    for (const input of document.querySelectorAll("input")) {
      const ac = input.getAttribute("autocomplete");
      expect(ac === null || ac === "off").toBe(true);
    }
  });
});
