import { expect, test } from "@playwright/test";

test.describe("security headers", () => {
  test("COEP=credentialless and COOP=same-origin are set on the SPA", async ({ request }) => {
    const res = await request.get("/", { failOnStatusCode: false, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["cross-origin-embedder-policy"]).toBe("credentialless");
    expect(res.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("Content-Security-Policy locks the SPA to its own origin", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  // The SPA must actually boot under the CSP (sqlite-wasm needs
  // 'wasm-unsafe-eval' and blob: workers).
  test("the app runs without CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  // HSTS is only meaningful behind TLS termination, which the host reverse
  // proxy does in production — set it there, not in this Caddyfile.
  test.skip("Strict-Transport-Security is set", () => {
    // intentionally empty
  });

  test("hardening headers are set", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});
