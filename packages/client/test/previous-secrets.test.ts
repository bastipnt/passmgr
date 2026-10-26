import type { CustomField, DecryptedRecord } from "@repo/schema";
import { toLocalDateStr } from "@repo/util";
import { describe, expect, it } from "vitest";
import { previousSecrets } from "../src/records/previous-secrets";

function login(
  version: number,
  password: string | undefined,
  customFields?: CustomField[],
): DecryptedRecord {
  return {
    recordId: "r1",
    version,
    schemaVersion: 1,
    type: "login",
    title: "GitHub",
    username: "jana",
    password,
    customFields,
    clientUpdatedAt: new Date(2026, 0, version).toISOString(),
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

/** `versions` oldest first; the last one is the record on screen and the history's head. */
function previous(...versions: DecryptedRecord[]) {
  const history = [...versions].reverse();
  return previousSecrets(history[0]!, history);
}

const until = (version: number) => toLocalDateStr(new Date(2026, 0, version).toISOString());
const pin = (value: string, title = "PIN"): CustomField => ({ title, type: "secret", value });

describe("previousSecrets", () => {
  it("lists replaced passwords newest first, dated by their replacement", () => {
    const entries = previous(login(1, "a"), login(2, "b"), login(3, "b"), login(4, "c"));

    expect(entries.map(({ value, label }) => [value, label])).toEqual([
      ["b", `Used until ${until(4)}`],
      ["a", `Used until ${until(2)}`],
    ]);
  });

  it("renders them as hidden secrets with keys unique per version", () => {
    const [entry] = previous(login(1, "a"), login(2, "b"));

    expect(entry).toMatchObject({ kind: "secret", key: "password@1" });
  });

  it("keeps a cleared password", () => {
    expect(previous(login(1, "a"), login(2, undefined)).map((spec) => spec.value)).toEqual(["a"]);
  });

  it("leaves out the current value and lists a repeated one once", () => {
    const entries = previous(login(1, "a"), login(2, "b"), login(3, "a"), login(4, "b"));

    expect(entries.map((spec) => spec.value)).toEqual(["a"]);
  });

  it("takes the current values from the record when the history lags behind it", () => {
    const entries = previousSecrets(login(3, "c"), [login(2, "b"), login(1, "a")]);

    expect(entries.map(({ value, label }) => [value, label])).toEqual([
      ["b", `Used until ${until(3)}`],
      ["a", `Used until ${until(2)}`],
    ]);
  });

  it("covers secret custom fields but not text ones", () => {
    const hint = (value: string): CustomField => ({ title: "Hint", type: "text", value });
    const entries = previous(
      login(1, "a", [pin("1111"), hint("x")]),
      login(2, "a", [pin("2222"), hint("y")]),
    );

    expect(entries.map(({ value, label }) => [value, label])).toEqual([
      ["1111", `PIN · used until ${until(2)}`],
    ]);
  });

  it("leaves out a value a renamed field still holds", () => {
    const entries = previous(
      login(1, "a", [pin("1111")]),
      login(2, "a", [pin("1111", "Pin code")]),
    );

    expect(entries).toEqual([]);
  });

  it("has nothing for a record without history", () => {
    expect(previous(login(1, "a"))).toEqual([]);
    expect(previousSecrets(login(1, "a"), [])).toEqual([]);
  });
});
