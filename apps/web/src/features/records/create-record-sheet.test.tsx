import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen } from "@/test/render";
import CreateRecordSheet from "./CreateRecordSheet";

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useCreateRecord: () => ({ createRecord: vi.fn(), createPending: false }),
}));

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <CreateRecordSheet />
    </Router>,
  );
  return location;
}

describe("CreateRecordSheet", () => {
  it("starts at the type picker", () => {
    renderAt("/?new=");

    expect(screen.getByRole("heading", { name: "New item" })).toBeInTheDocument();
    for (const type of [
      "Login",
      "Credit card",
      "Identity",
      "Secure note",
      "SSH key",
      "API key",
      "Wi-Fi",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${type}\\b`) })).toBeInTheDocument();
    }
  });

  it("opens the picked type's form, keeping a prefilled title", async () => {
    renderAt("/?new=Home");

    await userEvent.click(screen.getByRole("link", { name: /^Wi-Fi\b/ }));

    expect(await screen.findByRole("heading", { name: "New Wi-Fi network" })).toBeInTheDocument();
    expect(screen.getByLabelText("Network name (SSID)")).toBeInTheDocument();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Home");
    expect(screen.getByRole("button", { name: "Create Wi-Fi network" })).toBeInTheDocument();
  });
});
