import type { CategoryFilter } from "@repo/client/src/providers/SortedRecordsProvider";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { FilterButton } from "./FilterSheet";

const list = vi.hoisted(() => ({
  query: "",
  categoryFilter: "all" as CategoryFilter,
  tagFilters: [] as string[],
  setCategoryFilter: vi.fn(),
  removeTag: vi.fn(),
}));
vi.mock("@repo/client/src/providers/SortedRecordsProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useSortedRecords: () => ({
    ...list,
    categoryCounts: {},
    tags: [],
    toggleTag: vi.fn(),
    clearTags: vi.fn(),
  }),
}));

beforeEach(() => {
  Object.assign(list, { query: "", categoryFilter: "all", tagFilters: [] });
  vi.clearAllMocks();
});

describe("ActiveFilterChips", () => {
  it("shows nothing while no filter is on", () => {
    renderWithProviders(<ActiveFilterChips />);
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });

  it("a chip per filter; × on one takes just that filter off", async () => {
    Object.assign(list, { categoryFilter: "login", tagFilters: ["work", "infra"] });
    renderWithProviders(<ActiveFilterChips />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Remove tag infra" }));
    expect(list.removeTag).toHaveBeenCalledWith("infra");
    expect(list.setCategoryFilter).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Remove filter Logins" }));
    expect(list.setCategoryFilter).toHaveBeenCalledWith("all");
  });

  it("hides during a search, which ignores them", () => {
    Object.assign(list, { query: "git", tagFilters: ["work"] });
    renderWithProviders(<ActiveFilterChips />);
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });
});

describe("FilterButton", () => {
  it("counts the category and each tag that are on", () => {
    Object.assign(list, { categoryFilter: "favorites", tagFilters: ["work", "infra"] });
    renderWithProviders(<FilterButton />);
    const button = screen.getByRole("button", { name: "Filter (3 on)" });
    expect(button).toHaveTextContent("3");
  });

  it("no count during a search, which ignores the filters", () => {
    Object.assign(list, { query: "git", tagFilters: ["work"] });
    renderWithProviders(<FilterButton />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent("");
  });

  it("no count while nothing is on", () => {
    renderWithProviders(<FilterButton />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent("");
  });
});
