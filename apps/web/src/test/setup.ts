import "@testing-library/jest-dom/vitest";
import { setArgonBounds } from "@repo/schema";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server";

// The 1s default flakes when turbo runs every package's tests at once: an
// unlock's chain of awaits (worker, store, background login) can outlast it.
configure({ asyncUtilTimeout: 5_000 });

// The tests derive with t:1 m:8 (`setPasswordKekParams`); the schemas check what
// comes back from the server, the disk and export files against these bounds.
setArgonBounds({ tMin: 1, mMin: 8, mMultipleOf: 1 });

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no Web Animations API; base-ui's ScrollArea polls it after opening.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
