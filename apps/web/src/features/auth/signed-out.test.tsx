import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderWithProviders, screen } from "@/test/render";
import { onSignedOutElsewhere, SIGNED_OUT_MESSAGE, SignedOutNote } from "./signed-out";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("sign-out from elsewhere", () => {
  it("reloads and shows the note once on the next unlock", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    onSignedOutElsewhere();
    expect(reload).toHaveBeenCalledOnce();

    // The lock mounts the login page before the old document unloads: it
    // shows nothing and leaves the flag for the reloaded one.
    renderWithProviders(<SignedOutNote />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    cleanup();

    // The reloaded document (fresh module state).
    vi.resetModules();
    const reloaded = await import("./signed-out");
    const { unmount } = renderWithProviders(<reloaded.SignedOutNote />);
    expect(screen.getByRole("status")).toHaveTextContent(SIGNED_OUT_MESSAGE);
    unmount();

    renderWithProviders(<reloaded.SignedOutNote />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows nothing after an ordinary lock", () => {
    renderWithProviders(<SignedOutNote />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
