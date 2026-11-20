import assert from "node:assert/strict";
import { test } from "node:test";
import { check, findLongLines, parseExemptList } from "./check-md-line-length.mjs";

const long = "x".repeat(121);

test("flags a prose line over the limit and reports its length", () => {
  assert.deepEqual(findLongLines(`ok\n${long}`), [{ line: 2, length: 121 }]);
});

test("counts characters, not bytes", () => {
  assert.deepEqual(findLongLines("—".repeat(120)), []);
});

test("allows code blocks, tables and URL lines", () => {
  const text = ["```", long, "```", `| ${long} |`, `see https://example.com/${long}`].join("\n");
  assert.deepEqual(findLongLines(text), []);
});

test("checks again after a code block closes", () => {
  assert.deepEqual(findLongLines(`\`\`\`\ncode\n\`\`\`\n${long}`), [{ line: 4, length: 121 }]);
});

test("skips exempt files and lists violations of the rest", () => {
  const files = { "a.md": long, "b.md": long, "c.md": "short" };
  const exempt = parseExemptList("# comment\nb.md\n\n");
  assert.deepEqual(
    check(Object.keys(files), (file) => files[file], exempt),
    ["a.md:1 (121 chars)"],
  );
});
