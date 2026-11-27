import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { latestNavigation, undoNavigation } from "@/app/page-transitions";
import { useDiscardGuard } from "./use-discard-guard";

vi.mock("@/app/page-transitions", () => ({ latestNavigation: vi.fn(), undoNavigation: vi.fn() }));

describe("useDiscardGuard", () => {
  it("Keep editing takes back the navigation that closed the sheet, not a later one", () => {
    let navigation = 4;
    vi.mocked(latestNavigation).mockImplementation(() => navigation);
    const location = memoryLocation({ path: "/records/r1/edit" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Router hook={location.hook} searchHook={location.searchHook}>
        {children}
      </Router>
    );
    const { result, rerender } = renderHook(
      ({ routeOpen }) => useDiscardGuard({ routeOpen, isDirty: () => true }),
      { initialProps: { routeOpen: true }, wrapper },
    );

    navigation = 5;
    rerender({ routeOpen: false });
    expect(result.current.open).toBe(true);
    expect(result.current.confirm.open).toBe(true);

    navigation = 6;
    act(() => result.current.confirm.onKeepEditing());

    expect(undoNavigation).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 5);
  });
});
