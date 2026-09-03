import type { LoginFieldSpec } from "./login-field-specs";

export type DiffStatus = "unchanged" | "edited" | "added" | "removed";

/**
 * One row of the side-by-side diff. A side is `undefined` when that revision
 * has no such field — the view renders empty space there so the other side
 * stays on its own row.
 */
export type DiffRow = {
  key: string;
  old?: LoginFieldSpec;
  latest?: LoginFieldSpec;
  status: DiffStatus;
};

/**
 * Pair two revisions' field specs by key, preserving render order.
 *
 * Both lists come out of `getLoginFieldSpecs` and so share a fixed field
 * order; only extra fields can genuinely move. A key that exists on both sides
 * but out of order is emitted as a removal of the old one, which keeps the walk
 * terminating and still shows both revisions' values.
 */
export function alignFieldSpecs(
  oldSpecs: LoginFieldSpec[],
  latestSpecs: LoginFieldSpec[],
): DiffRow[] {
  const oldKeys = new Set(oldSpecs.map((spec) => spec.key));

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < oldSpecs.length || j < latestSpecs.length) {
    const oldSpec = oldSpecs[i];
    const latestSpec = latestSpecs[j];

    if (oldSpec && latestSpec && oldSpec.key === latestSpec.key) {
      rows.push({
        key: oldSpec.key,
        old: oldSpec,
        latest: latestSpec,
        status: oldSpec.compare === latestSpec.compare ? "unchanged" : "edited",
      });
      i++;
      j++;
      continue;
    }

    if (latestSpec && !oldKeys.has(latestSpec.key)) {
      rows.push({ key: latestSpec.key, latest: latestSpec, status: "added" });
      j++;
      continue;
    }

    if (oldSpec) {
      // Either the key is gone from the latest revision, or it only moved —
      // both are shown as a removal followed by the addition further down.
      rows.push({ key: oldSpec.key, old: oldSpec, status: "removed" });
      i++;
      continue;
    }

    if (latestSpec) {
      rows.push({ key: latestSpec.key, latest: latestSpec, status: "added" });
      j++;
    }
  }

  return rows;
}
