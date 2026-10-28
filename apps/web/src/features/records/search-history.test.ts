import { beforeEach, describe, expect, it } from "vitest";
import { OPENED_FROM_SEARCH, searchReturnState } from "./search-history";

beforeEach(() => history.replaceState(null, "", "/"));

describe("searchReturnState", () => {
  it("marks an entry pushed over the search or replacing one opened from it", () => {
    expect(searchReturnState()).toBeUndefined();

    history.replaceState({ mobileSearch: { tagsBefore: [] } }, "", "/");
    expect(searchReturnState()).toEqual(OPENED_FROM_SEARCH);

    history.replaceState(OPENED_FROM_SEARCH, "", "/record/a");
    expect(searchReturnState()).toEqual(OPENED_FROM_SEARCH);
  });
});
