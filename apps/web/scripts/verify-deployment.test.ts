import { createHash } from "node:crypto";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../src/test/msw/server";
import { type Check, check, verdict } from "./verify-deployment";

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
