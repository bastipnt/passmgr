import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { server } from "../src/test/msw/server";
import { type Check, check, EXIT_CODES, run, verdict } from "./verify-deployment";

const SITE = "https://vault.example.test/";
const BODY = "<!doctype html>";
const HEADERS = [{ name: "Content-Security-Policy", value: "default-src 'self'" }];
const ENTRY: Check = {
  digest: createHash("sha256").update(BODY).digest("hex"),
  file: "index.html",
  encoding: "identity",
};

function serve(response: () => Response) {
  server.use(http.get(`${SITE}index.html`, response));
}

function genuine(body = BODY, csp = HEADERS[0].value) {
  return new HttpResponse(body, { headers: { "Content-Security-Policy": csp } });
}

describe("verify-deployment check", () => {
  it("passes the released file with its headers", async () => {
    serve(() => genuine());

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([]);
  });

  it("calls a network error unreachable", async () => {
    serve(() => HttpResponse.error());

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([
      { kind: "unreachable", message: expect.stringContaining("index.html (identity)") },
    ]);
  });

  it("calls a 5xx unreachable", async () => {
    serve(() => new HttpResponse(null, { status: 502 }));

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([
      { kind: "unreachable", message: "index.html (identity): HTTP 502" },
    ]);
  });

  it("calls a 404 a mismatch", async () => {
    serve(() => new HttpResponse(null, { status: 404 }));

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([
      { kind: "mismatch", message: "index.html (identity): HTTP 404" },
    ]);
  });

  it("calls another body a mismatch", async () => {
    serve(() => genuine("<script>steal()</script>"));

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([
      { kind: "mismatch", message: expect.stringContaining(`expected ${ENTRY.digest}`) },
    ]);
  });

  it("calls a weakened header a mismatch", async () => {
    serve(() => genuine(BODY, "default-src *"));

    expect(await check(SITE, HEADERS, ENTRY)).toEqual([
      { kind: "mismatch", message: expect.stringContaining("Content-Security-Policy") },
    ]);
  });
});

describe("verify-deployment verdict", () => {
  const unreachable = { kind: "unreachable", message: "a" } as const;
  const mismatch = { kind: "mismatch", message: "b" } as const;

  it("has none without failures", () => {
    expect(verdict([])).toBeUndefined();
  });

  it("is unreachable when only fetches failed", () => {
    expect(verdict([unreachable, unreachable])).toBe("unreachable");
  });

  it("is a mismatch as soon as one file differs", () => {
    expect(verdict([unreachable, mismatch, unreachable])).toBe("mismatch");
  });
});

describe("verify-deployment run", () => {
  // Valid sums and Caddyfile, so only the site URL can stop the run before the fetches.
  let dir: string;
  let sums: string;
  let caddyfile: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "verify-deployment-"));
    sums = join(dir, "SHA256SUMS");
    caddyfile = join(dir, "Caddyfile");
    writeFileSync(sums, `${ENTRY.digest}  index.html\n`);
    writeFileSync(
      caddyfile,
      ["Content-Security-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Embedder-Policy"]
        .map((name) => `${name} "x"\n`)
        .join(""),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each(["vault.example.test", "ftp://vault.example.test", "https://"])(
    "calls the malformed site URL %s an error before fetching anything",
    async (siteUrl) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await run([siteUrl, sums, caddyfile])).toBe(EXIT_CODES.error);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe("verify-deployment in web-served-code.yml", () => {
  const workflow = readFileSync(
    join(import.meta.dirname, "../../../.github/workflows/web-served-code.yml"),
    "utf8",
  );

  it("pins the exit codes the workflow tells kinds apart by", () => {
    const pinned = Object.fromEntries(
      [...workflow.matchAll(/^\s*EXIT_([A-Z]+): (\d+)$/gm)].map(([, kind, code]) => [
        kind.toLowerCase(),
        Number(code),
      ]),
    );

    expect(pinned).toEqual({
      mismatch: EXIT_CODES.mismatch,
      unreachable: EXIT_CODES.unreachable,
    });
  });

  it("gives every exit code its own value", () => {
    const codes = Object.values(EXIT_CODES);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("opens the alert issue when the check after a release's deploy fails", () => {
    const release = readFileSync(
      join(import.meta.dirname, "../../../.github/workflows/release.yml"),
      "utf8",
    );
    const call = /^ {2}verify-served-code:\n(?: {4}.*\n|\n)*/m.exec(release)?.[0];

    expect(workflow).toMatch(
      /^ {4}if: failure\(\) && \(github\.event_name != 'push' \|\| inputs\.alert\)$/m,
    );
    expect(call).toMatch(/^ {6}alert: true$/m);
  });

  it("marks unreachable runs with the step the alert counts", () => {
    const step = /^\s*UNREACHABLE_STEP: (.+)$/m.exec(workflow)?.[1];

    expect(step).toBeTruthy();
    expect(workflow).toContain(`- name: ${step}\n`);
  });
});
