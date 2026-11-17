import {
  getOpaqueConfig,
  KE2,
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
  RegistrationResponse,
  ScryptMemHardFn,
} from "@cloudflare/opaque-ts";
import { OPAQUE_SERVER_IDENTITY } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import { describe, expect, it } from "vitest";

const EMAIL = "alice@example.com";
const PASSWORD = "correct horse battery staple";

// The web KSF answers with a promise (the worker): the patched library must await it.
const asyncKsf = {
  name: "scrypt",
  harden: async (input: Uint8Array) => await opaqueKsf.harden(input),
};

describe("opaqueKsf", () => {
  it("hardens byte-identically to the library's built-in scrypt", async () => {
    const input = crypto.getRandomValues(new Uint8Array(32));
    expect(await opaqueKsf.harden(input)).toEqual(ScryptMemHardFn.harden(input));
  });

  it("logs in with an async KSF to a registration made with the built-in one", async () => {
    const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
    const ake = await cfg.ake.generateAuthKeyPair();
    const oprfSeed = Array.from(crypto.getRandomValues(new Uint8Array(cfg.hash.Nh)));
    const server = new OpaqueServer(cfg, oprfSeed, ake, OPAQUE_SERVER_IDENTITY);

    const registering = new OpaqueClient(cfg);
    const request = await registering.registerInit(PASSWORD);
    if (request instanceof Error) throw request;
    const response = await server.registerInit(request, EMAIL);
    if (response instanceof Error) throw response;
    const registered = await registering.registerFinish(
      RegistrationResponse.deserialize(cfg, response.serialize()),
      OPAQUE_SERVER_IDENTITY,
      EMAIL,
    );
    if (registered instanceof Error) throw registered;

    const client = new OpaqueClient(cfg, asyncKsf);
    const ke1 = await client.authInit(PASSWORD);
    if (ke1 instanceof Error) throw ke1;
    const init = await server.authInit(ke1, registered.record, EMAIL, EMAIL);
    if (init instanceof Error) throw init;
    const finished = await client.authFinish(
      KE2.deserialize(cfg, init.ke2.serialize()),
      OPAQUE_SERVER_IDENTITY,
      EMAIL,
    );
    if (finished instanceof Error) throw finished;

    expect(finished.export_key).toEqual(registered.export_key);
  });
});
