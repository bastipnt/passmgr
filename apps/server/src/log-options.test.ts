import { Writable } from "node:stream";
import fastify from "fastify";
import { describe, expect, it } from "vitest";
import { logRedact, logSerializers, truncateIp } from "./log-options";

const SECRETS = {
  signature: "sig-1f2e3d",
  sessionId: "sess-9a8b7c",
  authorization: "Bearer tok-5d4c",
  cookie: "sid=cookie-3b2a",
  email: "alice@example.com",
  startLoginRequest: "ke1-aaaa",
  finishLoginRequest: "ke3-bbbb",
  startRegistrationRequest: "reg-req-cccc",
  registrationRecord: "reg-rec-dddd",
  recoveryKey: "rk-eeee",
  recoveryAuthKey: "rak-ffff",
  passwordKekSalt: "salt-gggg",
  userKeys: "keys-hhhh",
  ciphertext: "ct-0123456789abcdef",
  connectionParams: "cp-signature-iiii",
};

function buildApp() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const app = fastify({
    trustProxy: true,
    logger: { level: "info", stream, redact: logRedact, serializers: logSerializers },
  });
  app.post("/trpc/login.finishLogin", async (req) => {
    const { input } = req.body as { input: Record<string, string> };
    req.log.warn({ email: input.email, input, stage: "finishLogin" }, "auth.login.failure");
    return { ok: true };
  });
  return { app, lines };
}

describe("server log redaction", () => {
  it("censors auth headers, OPAQUE messages, email and recovery fields; never logs bodies or queries", async () => {
    const { app, lines } = buildApp();
    const { signature, sessionId, authorization, cookie, ciphertext, connectionParams, ...input } =
      SECRETS;

    const res = await app.inject({
      method: "POST",
      url: `/trpc/login.finishLogin?connectionParams=${connectionParams}`,
      headers: {
        "x-signature": signature,
        "x-session-id": sessionId,
        authorization,
        cookie,
        "x-forwarded-for": "203.0.113.77",
      },
      payload: { input: { ...input, ciphertext } },
    });
    expect(res.statusCode).toBe(200);

    const log = lines.join("");
    expect(log).toContain("auth.login.failure");
    expect(log).toContain("[REDACTED]");
    for (const [name, value] of Object.entries(SECRETS)) {
      if (name === "ciphertext") continue;
      expect(log, name).not.toContain(value);
    }
    expect(log).not.toContain("203.0.113.77");
    expect(log).toContain("203.0.113.0/24");
    expect(log).toContain('"url":"/trpc/login.finishLogin"');
  });

  it("keeps request bodies out of the request log", async () => {
    const { app, lines } = buildApp();
    app.post("/trpc/record.push", async () => ({ ok: true }));
    await app.inject({
      method: "POST",
      url: "/trpc/record.push",
      payload: { ciphertext: SECRETS.ciphertext },
    });
    expect(lines.join("")).not.toContain(SECRETS.ciphertext);
  });
});

describe("truncateIp", () => {
  it.each([
    ["203.0.113.77", "203.0.113.0/24"],
    ["::ffff:198.51.100.9", "198.51.100.0/24"],
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3::/48"],
    ["2001:db8::1", "2001:db8:0::/48"],
    ["::1", "0:0:0::/48"],
    ["not-an-ip", undefined],
    [undefined, undefined],
  ])("%s → %s", (ip, expected) => {
    expect(truncateIp(ip)).toBe(expected);
  });
});
