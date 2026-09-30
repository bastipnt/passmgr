import { SessionContext, SessionProvider } from "@repo/client";
import { useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/render";

function OfflineState() {
  const { isOffline } = useContext(SessionContext);
  return <span>{isOffline ? "offline" : "online"}</span>;
}

function renderSession() {
  render(
    <SessionProvider>
      <OfflineState />
    </SessionProvider>,
  );
}

describe("SessionProvider offline detection", () => {
  afterEach(() => vi.restoreAllMocks());

  // A page served by the service worker while offline never gets an `offline`
  // event; without the seed, login would go to the server and always fail.
  it("starts offline when the page loads without a connection", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderSession();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("follows the online/offline events after load", () => {
    renderSession();
    expect(screen.getByText("online")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText("offline")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
