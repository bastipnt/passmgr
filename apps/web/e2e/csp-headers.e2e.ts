import { expect, test } from "@playwright/test";

test.describe("security headers", () => {
  test("COEP=credentialless and COOP=same-origin are set on the SPA", async ({ request }) => {
    const res = await request.get("/", { failOnStatusCode: false, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["cross-origin-embedder-policy"]).toBe("credentialless");
    expect(res.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test.skip("Content-Security-Policy is set", // No CSP is sent today. Designing a policy that allows the SPA, the OPFS
  // worker, and the tRPC fetch endpoint without breaking dev or prod needs
  // a dedicated security pass. Enable once Caddyfile / @fastify/helmet adds
  // a policy.
  () => {
    // intentionally empty
  });

  test.skip("Strict-Transport-Security is set", // HSTS is only meaningful behind TLS termination; currently the prod
  // Caddyfile does not enable it (the deployment terminates TLS upstream).
  // Enable once HSTS is part of the Caddy config.
  () => {
    // intentionally empty
  });

  test.skip("X-Frame-Options is set", // Not currently emitted by Caddy or the server. Add via Caddyfile
  // (`header X-Frame-Options DENY`) or via @fastify/helmet, then enable.
  () => {
    // intentionally empty
  });
});
