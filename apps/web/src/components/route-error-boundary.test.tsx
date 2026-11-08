import { setClientErrorSender } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { render, screen } from "@/test/render";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

const SECRET = "hunter2-decrypted-password";

function Boom(): never {
  throw new Error(`Invalid value ${SECRET}`);
}

afterEach(() => {
  vi.restoreAllMocks();
  setClientErrorSender(null);
});

describe("RouteErrorBoundary", () => {
  it("shows the fallback in place of the crashed view and keeps the rest running", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Router hook={memoryLocation({ path: "/record/1" }).hook}>
        <nav>sidebar</nav>
        <RouteErrorBoundary area="records">
          <Boom />
        </RouteErrorBoundary>
      </Router>,
    );

    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This page ran into a problem");
    expect(screen.getByRole("button", { name: "Back to vault" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("shows neither the error's message nor anything of it, in the page or the copied details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <Router hook={memoryLocation({ path: "/record/1" }).hook}>
        <RouteErrorBoundary area="records">
          <Boom />
        </RouteErrorBoundary>
      </Router>,
    );

    expect(document.body.textContent).not.toContain(SECRET);
    const errorId = screen.getByRole("alert").querySelector("code")?.textContent;
    expect(errorId).toMatch(/^[0-9a-f]{8}$/);

    await user.click(screen.getByRole("button", { name: "Copy error details" }));
    expect(writeText).toHaveBeenCalledOnce();
    const details = writeText.mock.calls[0]?.[0] ?? "";
    expect(details).toContain(`Error ID: ${errorId}`);
    expect(details).not.toContain(SECRET);
    expect(details).not.toContain("Invalid value");
  });

  it("recovers once the user navigates elsewhere", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let crash = true;
    function Maybe() {
      if (crash) throw new Error("x");
      return <p>recovered</p>;
    }
    const memory = memoryLocation({ path: "/a" });
    render(
      <Router hook={memory.hook}>
        <RouteErrorBoundary area="records">
          <Maybe />
        </RouteErrorBoundary>
      </Router>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    crash = false;
    memory.navigate("/b");
    expect(await screen.findByText("recovered")).toBeInTheDocument();
  });

  it("counts the crash on the server with its area only", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sender = vi.fn().mockResolvedValue(undefined);
    setClientErrorSender(sender);
    render(
      <Router hook={memoryLocation({ path: "/record/1" }).hook}>
        <RouteErrorBoundary area="settings">
          <Boom />
        </RouteErrorBoundary>
      </Router>,
    );

    expect(sender).toHaveBeenCalledExactlyOnceWith({
      kind: "render",
      area: "settings",
      platform: "web",
      version: "other",
    });
    expect(JSON.stringify(sender.mock.calls)).not.toContain(SECRET);
  });
});
