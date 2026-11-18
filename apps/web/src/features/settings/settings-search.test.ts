import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findSettingTarget,
  matchSettings,
  revealSetting,
  SETTINGS_INDEX,
  settingsIndexFor,
} from "./settings-search";
import { SETTINGS_GROUPS } from "./settings-sections";

const sections = SETTINGS_GROUPS.flatMap((group) => group.sections);

function labels(query: string, linked = true) {
  return matchSettings(query, sections, settingsIndexFor(linked)).map(({ section, matches }) => [
    section.label,
    matches.map((match) => match.label),
  ]);
}

describe("matchSettings", () => {
  it("finds nothing for an empty query", () => {
    expect(labels("  ")).toEqual([]);
  });

  it("puts a setting whose label starts with the query first", () => {
    expect(labels("lock")[0]).toEqual(["Security", ["Lock when idle"]]);
  });

  it("matches synonyms, grouped by section", () => {
    expect(labels("2fa")).toEqual([["Account", ["Two-factor authentication"]]]);
    expect(labels("timeout")).toEqual([
      ["Security", ["Lock when idle", "Clear clipboard", "Hide revealed values"]],
    ]);
    expect(labels("export")).toEqual([
      [
        "Import & export",
        ["Import & export", "Encrypted backup", "Plain file for another app", "Import"],
      ],
    ]);
    expect(labels("color")).toEqual([["Appearance", ["Theme", "Accent"]]]);
  });

  it("needs every word, each at the start of a word, ignoring case and accents", () => {
    expect(labels("CLEAR clip")).toEqual([["Security", ["Clear clipboard"]]]);
    expect(labels("clipboard idle")).toEqual([]);
    expect(labels("ipboard")).toEqual([]);
    expect(labels("thème")[0]?.[1]).toContain("Theme");
  });

  it("matches a section by its name, and settings by their section's", () => {
    expect(labels("security")).toEqual([
      [
        "Security",
        [
          "Security",
          "Lock when idle",
          "Clear clipboard",
          "Hide revealed values",
          "Show website icons",
        ],
      ],
    ]);
  });

  it("orders groups by their best match", () => {
    expect(labels("sync", false).map(([section]) => section)).toEqual([
      "Sync & storage",
      "Account",
    ]);
  });

  it("leaves out what the account doesn't have and sections not on offer", () => {
    expect(labels("2fa", false)).toEqual([]);
    expect(labels("online account", false)).toEqual([["Account", ["Online account"]]]);
    const phone = sections.filter((section) => !section.desktopOnly);
    expect(matchSettings("hotkeys", phone)).toEqual([]);
  });

  it("indexes only paths of a section", () => {
    const paths = new Set(sections.map((section) => section.path));
    for (const entry of SETTINGS_INDEX) expect(paths).toContain(entry.path);
  });
});

describe("findSettingTarget", () => {
  function page(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  }
  const group = (label: string, rows: string, cardless = false) =>
    `<section data-settings-group><h3 data-settings-group-label>${label}</h3>${
      cardless ? rows : `<div data-slot="settings-card">${rows}</div>`
    }</section>`;
  const row = (label: string) =>
    `<div data-settings-row><span data-settings-label>${label}</span></div>`;

  it("finds a row by its label, within its group when one is named", () => {
    const root = page(group("Look", row("Theme") + row("Accent")) + group("Words", row("Length")));
    expect(findSettingTarget(root, { row: "Accent" })?.textContent).toBe("Accent");
    expect(findSettingTarget(root, { group: "Words", row: "Theme" })?.textContent).toBe("Length");
  });

  it("falls back to the group's card, or the group without one", () => {
    const root = page(group("Theme", "<p>switch</p>", true) + group("Import", row("x")));
    expect(findSettingTarget(root, { group: "Theme", row: "Theme" })?.tagName).toBe("SECTION");
    expect(findSettingTarget(root, { group: "Import" })?.dataset.slot).toBe("settings-card");
    expect(findSettingTarget(root, { row: "Nothing" })).toBeNull();
  });
});

describe("revealSetting", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function showPage(path: string, rows: string[]) {
    document.body.innerHTML = `<div data-settings-page="${path}">${rows
      .map((label) => `<div data-settings-row><span data-settings-label>${label}</span></div>`)
      .join("")}</div>`;
  }

  it("scrolls the row of the shown page into view and highlights it briefly", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const cancel = revealSetting("/settings/security", { row: "Clear clipboard" });
    showPage("/settings/account", ["Clear clipboard"]);
    showPage("/settings/security", ["Lock when idle", "Clear clipboard"]);

    const row = () => document.querySelectorAll<HTMLElement>("[data-settings-row]")[1];
    await waitFor(() => expect(row()).toHaveAttribute("data-highlighted"));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(row());
    cancel();
    expect(row()).not.toHaveAttribute("data-highlighted");
  });

  it("lands on the fallback when the page doesn't show the target", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    showPage("/settings/generator", ["Opens with", "Words"]);
    revealSetting("/settings/generator", { row: "Length", fallback: { row: "Opens with" } });

    await waitFor(() =>
      expect(document.querySelector("[data-settings-row]")).toHaveAttribute("data-highlighted"),
    );
  });
});
