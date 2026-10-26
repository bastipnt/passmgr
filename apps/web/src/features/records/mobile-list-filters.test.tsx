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
  clearFilters: vi.fn(),
}));
vi.mock("@repo/client/src/providers/SortedRecordsProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useSortedRecords: () => ({
    ...list,
    categoryCounts: {},
    tags: [],
    toggleTag: vi.fn(),
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

  it("phone: no Clear all, the filter sheet resets", () => {
    Object.assign(list, { tagFilters: ["work"] });
    renderWithProviders(<ActiveFilterChips />);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("desktop: Clear all takes every filter off, by keyboard too", async () => {
    Object.assign(list, { categoryFilter: "login", tagFilters: ["work"] });
    renderWithProviders(<ActiveFilterChips variant="desktop" />);
    const clearAll = screen.getByRole("button", { name: "Clear all" });

    clearAll.focus();
    await userEvent.keyboard("{Enter}");
    expect(list.clearFilters).toHaveBeenCalledOnce();
  });

  it("stays during a search, which keeps to them", () => {
    Object.assign(list, { query: "git", tagFilters: ["work"] });
    renderWithProviders(<ActiveFilterChips />);
    expect(screen.getByRole("list", { name: "Active filters" })).toBeInTheDocument();
  });
});

describe("FilterButton", () => {
  it("counts the category and each tag that are on", () => {
    Object.assign(list, { categoryFilter: "favorites", tagFilters: ["work", "infra"] });
    renderWithProviders(<FilterButton />);
    const button = screen.getByRole("button", { name: "Filter (3 on)" });
    expect(button).toHaveTextContent("3");
  });

  it("keeps its count during a search, which keeps to the filters", () => {
    Object.assign(list, { query: "git", tagFilters: ["work"] });
    renderWithProviders(<FilterButton />);
    expect(screen.getByRole("button", { name: "Filter (1 on)" })).toHaveTextContent("1");
  });

  it("no count while nothing is on", () => {
    renderWithProviders(<FilterButton />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent("");
  });
});
