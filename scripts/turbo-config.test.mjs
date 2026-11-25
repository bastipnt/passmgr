import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { tasks } = JSON.parse(readFileSync(new URL("../turbo.json", import.meta.url), "utf8"));

// Workspace packages are consumed as source (main: index.ts), so a cached test or typecheck must
// rehash when a dependency's files change: the transit task chains every dependency's inputs in.
test("source-consuming tasks depend on the transit task", () => {
  const tasksOnSource = Object.keys(tasks).filter(
    (name) => name === "typecheck" || name.startsWith("test"),
  );
  assert.ok(tasksOnSource.includes("test"));
  for (const name of tasksOnSource) {
    assert.ok(tasks[name].dependsOn?.includes("transit"), `${name} does not depend on transit`);
  }
});

test("transit chains through the dependencies", () => {
  assert.deepEqual(tasks.transit.dependsOn, ["^transit"]);
});
