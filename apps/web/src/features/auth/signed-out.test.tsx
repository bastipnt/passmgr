import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { onSignedOutElsewhere, SIGNED_OUT_MESSAGE, SignedOutNote } from "./signed-out";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("sign-out from elsewhere", () => {
  it("reloads and shows the note once on the next unlock", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    onSignedOutElsewhere();
    expect(reload).toHaveBeenCalledOnce();

    const { unmount } = renderWithProviders(<SignedOutNote />);
    expect(screen.getByRole("status")).toHaveTextContent(SIGNED_OUT_MESSAGE);
    unmount();

    renderWithProviders(<SignedOutNote />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows nothing after an ordinary lock", () => {
    renderWithProviders(<SignedOutNote />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
