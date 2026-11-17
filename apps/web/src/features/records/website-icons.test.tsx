import { clearPreferenceCache, PREF_KEYS } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RecordForm from "./RecordForm";
import { WebsiteAvatar } from "./WebsiteAvatar";

vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));

const requested: string[] = [];

class RecordingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    requested.push(value);
  }
}

function enableWebsiteIcons() {
  localStorage.setItem(PREF_KEYS.websiteIcons, "true");
}

describe("website icons", () => {
  beforeEach(() => {
    requested.length = 0;
    localStorage.clear();
    clearPreferenceCache();
    vi.stubGlobal("Image", RecordingImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends no host to DuckDuckGo unless the user opted in", () => {
    renderWithProviders(<WebsiteAvatar title="GitHub" websites={[{ value: "github.com" }]} />);

    expect(requested).toEqual([]);
  });

  it("looks up a saved host once opted in", async () => {
    enableWebsiteIcons();
    renderWithProviders(<WebsiteAvatar title="GitHub" websites={[{ value: "github.com" }]} />);

    await waitFor(() =>
      expect(requested).toEqual(["https://icons.duckduckgo.com/ip3/github.com.ico"]),
    );
  });

  it("looks up a typed website only once the field is left", async () => {
    enableWebsiteIcons();
    renderWithProviders(<RecordForm type="login" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("example.com"), "github.com");
    expect(requested).toEqual([]);

    await userEvent.tab();
    await waitFor(() =>
      expect(requested).toEqual(["https://icons.duckduckgo.com/ip3/github.com.ico"]),
    );
  });

  it("looks up a typed website on Enter", async () => {
    enableWebsiteIcons();
    renderWithProviders(<RecordForm type="login" onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("example.com"), "github.com{Enter}");
    await waitFor(() =>
      expect(requested).toEqual(["https://icons.duckduckgo.com/ip3/github.com.ico"]),
    );
  });
});
