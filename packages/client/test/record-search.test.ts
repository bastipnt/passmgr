import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import {
  addRecentSearch,
  filterByTagText,
  matchRange,
  matchRecords,
  matchTags,
  parseSearch,
  searchOptionSections,
  searchSections,
  tagModeGroups,
  topTags,
} from "../src/records/record-search";

const login = (title: string, username: string, tags?: string[]) =>
  ({ recordId: title, type: "login", title, username, tags }) as DecryptedRecord;

const records = [
  login("Vercel", "ci", ["deploy"]),
  login("GitHub", "deploy-bot"),
  login("Deploy key", "root"),
  login("Notion", "anna", ["docs"]),
];

describe("parseSearch", () => {
  it("reads a leading # as tag mode", () => {
    expect(parseSearch("  dep ")).toEqual({ tagMode: false, text: "dep" });
    expect(parseSearch(" #in ")).toEqual({ tagMode: true, text: "in" });
    expect(parseSearch("#")).toEqual({ tagMode: true, text: "" });
    expect(parseSearch("a#b")).toEqual({ tagMode: false, text: "a#b" });
  });

  it("without tag search, drops a leading # and searches the rest", () => {
    expect(parseSearch(" #in ", false)).toEqual({ tagMode: false, text: "in" });
    expect(parseSearch("#", false)).toEqual({ tagMode: false, text: "" });
    expect(parseSearch("a#b", false)).toEqual({ tagMode: false, text: "a#b" });
  });
});

describe("matchRange", () => {
  it("finds the query without case", () => {
    expect(matchRange("GitHub", "hub")).toEqual({ start: 3, end: 6 });
    expect(matchRange("GitHub", "lab")).toBeUndefined();
    expect(matchRange("GitHub", "")).toBeUndefined();
  });
});

describe("matchRecords", () => {
  it("ranks title, then subtitle, then tag matches, and says why each matched", () => {
    expect(matchRecords(records, "dep").map(({ record, field }) => [record.title, field])).toEqual([
      ["Deploy key", "title"],
      ["GitHub", "subtitle"],
      ["Vercel", "tag"],
    ]);
    expect(matchRecords(records, "dep")[2]).toMatchObject({ tag: "deploy" });
  });

  it("matches a login's email as its subtitle, also next to a username", () => {
    const withEmail = [
      { ...login("Shop", "shopper"), email: "anna@mail.example" },
      { ...login("Forum", ""), email: "anna@forum.example" },
    ] as DecryptedRecord[];
    expect(matchRecords(withEmail, "anna@")).toEqual([
      { record: withEmail[0], field: "subtitle", subtitle: "anna@mail.example" },
      { record: withEmail[1], field: "subtitle", subtitle: "anna@forum.example" },
    ]);
  });
});

describe("tags", () => {
  const tags = [
    { tag: "infra", count: 5 },
    { tag: "clients", count: 4 },
    { tag: "insurance", count: 0 },
    { tag: "invoices", count: 2 },
    { tag: "work", count: 9 },
  ];

  it("filterByTagText keeps records with a matching tag", () => {
    expect(filterByTagText(records, "DEP").map(({ title }) => title)).toEqual(["Vercel"]);
    expect(filterByTagText(records, "").map(({ title }) => title)).toEqual(["Vercel", "Notion"]);
  });

  it("matchTags and topTags", () => {
    expect(matchTags(tags, "in").map(({ tag }) => tag)).toEqual(["infra", "insurance", "invoices"]);
    expect(topTags(tags, 2).map(({ tag }) => tag)).toEqual(["work", "infra"]);
  });

  it("tag mode: the selected first, then those narrowing the view; the rest apart", () => {
    // "infra" is selected (first, as the provider orders them).
    const { matching, other } = tagModeGroups(tags, 1, "in");
    expect(matching.map(({ tag }) => tag)).toEqual(["infra", "invoices"]);
    expect(other.map(({ tag }) => tag)).toEqual(["clients", "insurance", "work"]);

    expect(tagModeGroups(tags, 0, "").matching.map(({ tag }) => tag)).toEqual([
      "infra",
      "clients",
      "invoices",
      "work",
    ]);
  });
});

describe("searchSections", () => {
  const tags = [
    { tag: "deploy", count: 1 },
    { tag: "docs", count: 1 },
  ];
  const base = {
    tags,
    selectedCount: 0,
    recentRecords: records.slice(3),
    recordsLabel: "Logins",
  };

  it("nothing typed: top tags, then recently opened", () => {
    const sections = searchSections({ ...base, search: parseSearch(""), recordMatches: [] });
    expect(sections.map(({ label, items }) => [label, items.length])).toEqual([
      ["Top tags", 2],
      ["Recently opened", 1],
    ]);
  });

  it("nothing typed under selected tags: top tags, then the tagged records", () => {
    const sections = searchSections({
      ...base,
      selectedCount: 2,
      search: parseSearch(""),
      recordMatches: [],
      tagged: { records: records.slice(0, 1), category: "Logins" },
    });
    expect(sections.map(({ label, items }) => [label, items.length])).toEqual([
      ["Top tags", 2],
      ["Logins tagged #deploy + #docs", 1],
    ]);
  });

  it("typed: matching tags, then the records under the scope's label", () => {
    const recordMatches = matchRecords(records, "dep");
    const sections = searchSections({ ...base, search: parseSearch("dep"), recordMatches });
    expect(sections.map(({ label, items }) => [label, items.length])).toEqual([
      ["Tags", 1],
      ["Logins", 3],
    ]);
  });

  it("tag mode: the narrowing tags, then the rest dimmed", () => {
    const [matching, other] = searchSections({
      ...base,
      search: parseSearch("#de"),
      recordMatches: [],
    });
    expect(matching).toMatchObject({ label: "Tags matching “de”", items: [{ tag: "deploy" }] });
    expect(other?.items).toEqual([{ kind: "tag", tag: "docs", count: 1, dimmed: true }]);
  });
});

describe("searchOptionSections", () => {
  it("gives each item a stable id and marks the selected tags on, matched without case", () => {
    const [section] = searchOptionSections(
      [
        {
          id: "mixed",
          label: "Mixed",
          items: [
            { kind: "tag", tag: "Deploy", count: 1 },
            { kind: "tag", tag: "docs", count: 1 },
            { kind: "record", record: records[0] as DecryptedRecord },
          ],
        },
      ],
      ["deploy"],
    );
    expect(section).toMatchObject({ id: "mixed", label: "Mixed" });
    expect(section?.options.map(({ id, on }) => [id, on])).toEqual([
      ["tag:deploy", true],
      ["tag:docs", false],
      ["record:Vercel", undefined],
    ]);
  });
});

describe("addRecentSearch", () => {
  it("keeps newest first, once each (text without case, tags in any order)", () => {
    let searches = addRecentSearch([], { text: " aws ", tags: [] });
    searches = addRecentSearch(searches, { text: "", tags: ["work", "finance"] });
    searches = addRecentSearch(searches, { text: "AWS", tags: [] });
    searches = addRecentSearch(searches, { text: "", tags: ["Finance", "work"] });
    expect(searches).toEqual([
      { text: "", tags: ["Finance", "work"] },
      { text: "AWS", tags: [] },
    ]);
  });

  it("skips an empty search and keeps only the newest few", () => {
    expect(addRecentSearch([], { text: "  ", tags: [] })).toEqual([]);
    let searches = addRecentSearch([], { text: "a", tags: [] });
    for (const text of ["b", "c"]) searches = addRecentSearch(searches, { text, tags: [] }, 2);
    expect(searches.map(({ text }) => text)).toEqual(["c", "b"]);
  });
});
