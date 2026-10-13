import { describe, expect, it } from "vitest";
import {
  deviceLoginChallenge,
  deviceSessionKey,
  generateDeviceLoginKeyPair,
} from "../src/device-login";

describe("device login", () => {
  it("both sides derive the same session key", async () => {
    const client = generateDeviceLoginKeyPair();
    const server = generateDeviceLoginKeyPair();
    const challenge = deviceLoginChallenge(
      new Uint8Array(32).fill(1),
      server.publicKey,
      client.publicKey,
    );

    const onClient = await deviceSessionKey(client.privateKey, server.publicKey, challenge);
    const onServer = await deviceSessionKey(server.privateKey, client.publicKey, challenge);
    expect(onClient).toBe(onServer);
  });

  it("binds the challenge to the nonce and both public keys", () => {
    const a = generateDeviceLoginKeyPair().publicKey;
    const b = generateDeviceLoginKeyPair().publicKey;
    const c = generateDeviceLoginKeyPair().publicKey;
    const nonce = new Uint8Array(32).fill(1);
    const base = deviceLoginChallenge(nonce, a, b);

    expect(deviceLoginChallenge(nonce, a, b)).toEqual(base);
    expect(deviceLoginChallenge(new Uint8Array(32).fill(2), a, b)).not.toEqual(base);
    expect(deviceLoginChallenge(nonce, c, b)).not.toEqual(base);
    expect(deviceLoginChallenge(nonce, a, c)).not.toEqual(base);
  });

  it("another challenge gives another session key", async () => {
    const client = generateDeviceLoginKeyPair();
    const server = generateDeviceLoginKeyPair();
    const first = await deviceSessionKey(client.privateKey, server.publicKey, new Uint8Array(32));
    const second = await deviceSessionKey(
      client.privateKey,
      server.publicKey,
      new Uint8Array(32).fill(1),
    );
    expect(first).not.toBe(second);
  });
});
