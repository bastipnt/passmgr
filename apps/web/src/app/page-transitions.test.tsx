import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router, Switch } from "wouter";
import { navigate } from "wouter/use-browser-location";
import { pageDepths, passMonitorPaths, recordPaths, settingsPaths } from "./route-paths";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", async (importActual) => ({
  ...(await importActual<object>()),
  isMobile: () => viewport.mobile,
}));

type PageTransitionsModule = typeof import("./page-transitions");

let pt: PageTransitionsModule;
let scrollY = 0;

/**
 * The module keeps its stack and scroll memory at module level, so each test
 * gets a fresh copy, starting at `path`.
 */
async function setup(path: string = recordPaths.index) {
  history.replaceState(null, "", path);
  vi.resetModules();
  pt = await import("./page-transitions");
  const { PageTransitions, usePageBack, usePageLocation, usePageSearch } = pt;

  function BackButton() {
    const goBack = usePageBack(recordPaths.index);
    return (
      <button type="button" onClick={goBack}>
        back
      </button>
    );
  }

  render(
    <Router hook={usePageLocation} searchHook={usePageSearch}>
      <PageTransitions pageDepths={pageDepths} />
      <Switch>
        <Route path={recordPaths.detailAny}>
          <p>record</p>
          <BackButton />
        </Route>
        <Route>
          <p>list</p>
        </Route>
      </Switch>
    </Router>,
  );
}

const clickBack = () => act(() => screen.getByRole("button", { name: "back" }).click());

beforeEach(() => {
  scrollY = 0;
  // jsdom doesn't scroll; track the offset scroll restoration asks for.
  vi.spyOn(window, "scrollTo").mockImplementation(((_x: number, y: number) => {
    scrollY = y;
  }) as typeof window.scrollTo);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("page direction", () => {
  beforeEach(() => setup());

  it("derives the direction from page depth", () => {
    expect(pt.directionBetween(recordPaths.index, recordPaths.record("a"))).toBe("push");
    expect(pt.directionBetween(recordPaths.record("a"), recordPaths.index)).toBe("pop");
    expect(pt.directionBetween(passMonitorPaths.index, passMonitorPaths.duplicates)).toBe("push");
    expect(pt.directionBetween(settingsPaths.appearance, settingsPaths.index)).toBe("pop");
    expect(pt.directionBetween(passMonitorPaths.index, recordPaths.index)).toBe("pop");
  });

  it("doesn't animate between pages at the same depth or off the stack", () => {
    expect(pt.directionBetween(recordPaths.record("a"), recordPaths.record("b"))).toBeUndefined();
    expect(
      pt.directionBetween(recordPaths.record("a"), recordPaths.editRecord("a")),
    ).toBeUndefined();
    expect(pt.directionBetween("/login", recordPaths.index)).toBeUndefined();
  });

  it("publishes navigations to the router", () => {
    act(() => navigate(recordPaths.record("a")));
    expect(screen.getByText("record")).toBeDefined();
  });
});

describe("view transitions", () => {
  const rejected = (name: string) => Promise.reject(new DOMException("Transition aborted", name));

  beforeEach(async () => {
    viewport.mobile = true;
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    await setup();
  });
  afterEach(() => {
    viewport.mobile = false;
    // @ts-expect-error jsdom has none; the test added it
    delete document.startViewTransition;
  });

  it.each(["AbortError", "InvalidStateError"])(
    "never reports a slide that didn't play (%s)",
    async (name) => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const startViewTransition = vi.fn((update?: unknown) => {
        if (typeof update === "function") update();
        return {
          ready: rejected(name),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        } as unknown as ViewTransition;
      });
      document.startViewTransition = startViewTransition;

      act(() => navigate(recordPaths.record("a")));
      act(() => navigate(recordPaths.index));
      // Node reports an unhandled rejection once the microtasks after it ran: a macrotask later.
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off("unhandledRejection", unhandled);

      expect(startViewTransition).toHaveBeenCalled();
      expect(screen.getByText("list")).toBeDefined();
      expect(unhandled).not.toHaveBeenCalled();
      expect(document.documentElement.dataset.nav).toBeUndefined();
    },
  );
});

describe("usePageBack", () => {
  it("steps back one entry to the page that pushed this one", async () => {
    await setup();
    act(() => navigate(recordPaths.record("a")));
    const go = vi.spyOn(history, "go").mockImplementation(() => {});

    clickBack();

    expect(go).toHaveBeenCalledWith(-1);
  });

  it("skips entries a closed sheet left at the same depth", async () => {
    await setup();
    act(() => navigate(recordPaths.record("a")));
    act(() => navigate(recordPaths.editRecord("a")));
    act(() => navigate(recordPaths.record("a"), { replace: true }));
    const go = vi.spyOn(history, "go").mockImplementation(() => {});

    clickBack();

    expect(go).toHaveBeenCalledWith(-2);
  });

  it("replaces a deep-linked page with the fallback", async () => {
    await setup(recordPaths.record("a"));
    const go = vi.spyOn(history, "go");

    clickBack();

    expect(go).not.toHaveBeenCalled();
    expect(location.pathname).toBe(recordPaths.index);
    expect(screen.getByText("list")).toBeDefined();
  });
});

describe("scroll restoration", () => {
  beforeEach(() => setup());

  it("opens a pushed page at the top and restores the parent on the way back", () => {
    scrollY = 500;
    act(() => navigate(recordPaths.record("a")));
    expect(scrollY).toBe(0);

    scrollY = 120;
    act(() => navigate(recordPaths.index));
    expect(scrollY).toBe(500);
  });

  it("keeps the page where it is while a sheet route opens and closes", () => {
    act(() => navigate(recordPaths.record("a")));
    scrollY = 300;

    act(() => navigate(recordPaths.editRecord("a")));
    expect(scrollY).toBe(300);

    act(() => navigate(recordPaths.record("a"), { replace: true }));
    expect(scrollY).toBe(300);
  });
});
