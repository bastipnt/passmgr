import { toBase64 } from "@repo/util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateBiometric,
  BIOMETRIC_KEY,
  type BiometricKeyMaterial,
  enrollBiometric,
  isPrfSupported,
} from "../src/biometric";

// Minimal WebAuthn mock: a fake authenticator that returns a deterministic
// PRF output for a given (credentialId, prfSalt) pair so enroll + authenticate
// can round-trip without touching real platform APIs.

type CredentialRecord = {
  rawId: Uint8Array;
};

const fakeAuthenticatorState = {
  credentials: new Map<string, CredentialRecord>(),
  prfSupported: true,
  /**
   * If true, navigator.credentials.create returns `{enabled: true}` without
   * `results.first`, forcing enrollBiometric to make a separate get() call to
   * obtain the PRF output (covers the fallback branch in biometric.ts).
   */
  deferPrfToGet: false,
  shouldCancelCreate: false,
  shouldCancelGet: false,
  noPublicKey: false,
  lastCreate: undefined as unknown,
  lastGet: undefined as unknown,
};

const HOST = "vault.example.com";
const ENROLL = { rpName: "passmgr", userName: "alice@example.com" };
const SPKI = new Uint8Array(91).fill(4);

function prfFor(credentialId: Uint8Array, prfSalt: Uint8Array): ArrayBuffer {
  // Deterministic: id||salt repeated to 32 bytes. Independent of real PRF, but stable.
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) {
    out[i] = (credentialId[i % credentialId.length]! ^ prfSalt[i % prfSalt.length]!) & 0xff;
  }
  return out.buffer;
}

function installWebAuthnMock() {
  const origCredentials = (globalThis as { navigator?: Navigator }).navigator?.credentials;
  const origPKC = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;

  const credentials = {
    async create(options: {
      publicKey: {
        extensions?: { prf?: { eval?: { first: ArrayBuffer } } };
      };
    }) {
      fakeAuthenticatorState.lastCreate = options.publicKey;
      if (fakeAuthenticatorState.shouldCancelCreate) return null;
      const rawId = crypto.getRandomValues(new Uint8Array(16));
      const credId = Array.from(rawId).join(",");
      fakeAuthenticatorState.credentials.set(credId, { rawId });

      const prfSaltBuf = options.publicKey.extensions?.prf?.eval?.first;
      const prfSalt = prfSaltBuf ? new Uint8Array(prfSaltBuf) : new Uint8Array(32);

      return {
        rawId: rawId.buffer,
        response: fakeAuthenticatorState.noPublicKey
          ? {}
          : { getPublicKey: () => SPKI.buffer, getPublicKeyAlgorithm: () => -7 },
        getClientExtensionResults: () => ({
          prf: fakeAuthenticatorState.prfSupported
            ? fakeAuthenticatorState.deferPrfToGet
              ? { enabled: true }
              : { enabled: true, results: { first: prfFor(rawId, prfSalt) } }
            : { enabled: false },
        }),
      };
    },
    async get(options: {
      publicKey: {
        allowCredentials?: ReadonlyArray<{ id: ArrayBuffer | Uint8Array }>;
        extensions?: { prf?: { eval?: { first: ArrayBuffer } } };
      };
    }) {
      fakeAuthenticatorState.lastGet = options.publicKey;
      if (fakeAuthenticatorState.shouldCancelGet) return null;
      const first = options.publicKey.allowCredentials?.[0];
      if (!first) throw new Error("no allowCredentials");
      const id = first.id;
      const rawId = id instanceof ArrayBuffer ? new Uint8Array(id) : new Uint8Array(id);
      const prfSaltBuf = options.publicKey.extensions?.prf?.eval?.first;
      const prfSalt = prfSaltBuf ? new Uint8Array(prfSaltBuf) : new Uint8Array(32);

      return {
        rawId: rawId.buffer,
        response: {
          authenticatorData: new Uint8Array([1, 2, 3]).buffer,
          clientDataJSON: new Uint8Array([4, 5]).buffer,
          signature: new Uint8Array([6]).buffer,
        },
        getClientExtensionResults: () => ({
          prf: fakeAuthenticatorState.prfSupported
            ? { results: { first: prfFor(rawId, prfSalt) } }
            : {},
        }),
      };
    },
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { credentials },
  });

  Object.defineProperty(globalThis, "PublicKeyCredential", {
    configurable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(async () => true),
    },
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { PublicKeyCredential: globalThis.PublicKeyCredential, location: { hostname: HOST } },
  });

  return () => {
    if (origCredentials) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { credentials: origCredentials },
      });
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
    if (origPKC) {
      Object.defineProperty(globalThis, "PublicKeyCredential", {
        configurable: true,
        value: origPKC,
      });
    } else {
      delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    }
    delete (globalThis as { window?: unknown }).window;
  };
}

let restore: () => void = () => {};

beforeEach(() => {
  fakeAuthenticatorState.credentials.clear();
  fakeAuthenticatorState.prfSupported = true;
  fakeAuthenticatorState.deferPrfToGet = false;
  fakeAuthenticatorState.shouldCancelCreate = false;
  fakeAuthenticatorState.shouldCancelGet = false;
  fakeAuthenticatorState.noPublicKey = false;
  restore = installWebAuthnMock();
});

afterEach(() => {
  restore();
});

describe("BIOMETRIC_KEY", () => {
  it("lists the material fields in a stable order", () => {
    expect(BIOMETRIC_KEY).toEqual([
      "biometricEncryptedAccountKey",
      "biometricNonce",
      "credentialId",
      "prfSalt",
      "biometricDeviceLogin",
    ]);
  });
});

describe("isPrfSupported", () => {
  it("returns true when the platform authenticator advertises availability", async () => {
    expect(await isPrfSupported()).toBe(true);
  });

  it("returns false when window is undefined", async () => {
    restore();
    // Reinstall without a window
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { credentials: {} },
    });
    delete (globalThis as { window?: unknown }).window;
    expect(await isPrfSupported()).toBe(false);
    restore = installWebAuthnMock();
  });

  it("returns false when PublicKeyCredential is missing", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    expect(await isPrfSupported()).toBe(false);
  });

  function withCapabilities(capabilities: Record<string, boolean>) {
    const pkc = globalThis.PublicKeyCredential as unknown as Record<string, unknown>;
    pkc.getClientCapabilities = async () => capabilities;
  }

  it("returns false when the browser reports no PRF extension", async () => {
    withCapabilities({ userVerifyingPlatformAuthenticator: true, "extension:prf": false });
    expect(await isPrfSupported()).toBe(false);
  });

  it("trusts the reported platform authenticator over the legacy check", async () => {
    withCapabilities({ userVerifyingPlatformAuthenticator: false, "extension:prf": true });
    expect(await isPrfSupported()).toBe(false);
  });

  it("falls back to the legacy check when PRF support isn't reported", async () => {
    withCapabilities({});
    expect(await isPrfSupported()).toBe(true);
  });

  it("returns false when isUserVerifyingPlatformAuthenticatorAvailable throws", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      configurable: true,
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: () => {
          throw new Error("nope");
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { PublicKeyCredential: globalThis.PublicKeyCredential },
    });
    expect(await isPrfSupported()).toBe(false);
  });
});

async function enroll(accountKey: Uint8Array): Promise<BiometricKeyMaterial> {
  return (await enrollBiometric(accountKey, ENROLL)).material;
}

describe("enrollBiometric / authenticateBiometric", () => {
  it("names the relying party and the account, pinned to this host", async () => {
    const material = await enroll(new Uint8Array(32).fill(1));
    expect(fakeAuthenticatorState.lastCreate).toMatchObject({
      rp: { id: HOST, name: "passmgr" },
      user: { name: "alice@example.com", displayName: "alice@example.com" },
    });

    await authenticateBiometric(material);
    expect(fakeAuthenticatorState.lastGet).toMatchObject({ rpId: HOST });
  });

  it("stores only the wrapped account key, never anything that logs in", async () => {
    const material = await enroll(new Uint8Array(32).fill(7));
    expect(Object.keys(material).sort()).toEqual(
      ["biometricEncryptedAccountKey", "biometricNonce", "credentialId", "prfSalt"].sort(),
    );
  });

  it("hands out the credential's public key for the server", async () => {
    const { devicePublicKey } = await enrollBiometric(new Uint8Array(32), ENROLL);
    expect(devicePublicKey).toEqual({ publicKey: toBase64(SPKI), algorithm: -7 });
  });

  it("has no public key when the browser can't give one", async () => {
    fakeAuthenticatorState.noPublicKey = true;
    const { devicePublicKey } = await enrollBiometric(new Uint8Array(32), ENROLL);
    expect(devicePublicKey).toBeUndefined();
  });

  it("round-trips the account key through authenticateBiometric", async () => {
    const accountKey = new Uint8Array(32);
    crypto.getRandomValues(accountKey);
    const material = await enroll(accountKey);

    const recovered = await authenticateBiometric(material);
    expect(recovered.accountKey).toEqual(accountKey);
    expect(recovered.assertion).toBeUndefined();
  });

  it("signs a given challenge and returns the assertion", async () => {
    const material = await enroll(new Uint8Array(32).fill(2));
    const challenge = new Uint8Array(32).fill(9);

    const { assertion } = await authenticateBiometric(material, challenge);
    const sent = fakeAuthenticatorState.lastGet as { challenge: ArrayBuffer };
    expect(new Uint8Array(sent.challenge)).toEqual(challenge);
    expect(assertion).toEqual({
      authenticatorData: toBase64(new Uint8Array([1, 2, 3])),
      clientDataJSON: toBase64(new Uint8Array([4, 5])),
      signature: toBase64(new Uint8Array([6])),
    });
  });

  it("produces distinct material across two enrollments of the same key", async () => {
    const accountKey = new Uint8Array(32).fill(9);
    const a = await enroll(accountKey);
    const b = await enroll(accountKey);
    expect(a.credentialId).not.toBe(b.credentialId);
    expect(a.prfSalt).not.toBe(b.prfSalt);
    expect(a.biometricNonce).not.toBe(b.biometricNonce);
    expect(a.biometricEncryptedAccountKey).not.toBe(b.biometricEncryptedAccountKey);
  });

  it("throws when WebAuthn credential creation is cancelled", async () => {
    fakeAuthenticatorState.shouldCancelCreate = true;
    await expect(enroll(new Uint8Array(32))).rejects.toThrow(/cancelled/i);
  });

  it("throws when the assertion during authenticate is cancelled", async () => {
    const material = await enroll(new Uint8Array(32).fill(1));
    fakeAuthenticatorState.shouldCancelGet = true;
    await expect(authenticateBiometric(material)).rejects.toThrow(/cancelled/i);
  });

  it("throws when PRF is not supported by the authenticator on enrollment", async () => {
    fakeAuthenticatorState.prfSupported = false;
    await expect(enroll(new Uint8Array(32))).rejects.toThrow(/PRF/i);
  });

  it("throws when PRF result is missing during authentication", async () => {
    const material = await enroll(new Uint8Array(32).fill(1));
    fakeAuthenticatorState.prfSupported = false;
    await expect(authenticateBiometric(material)).rejects.toThrow(/PRF/i);
  });

  it("round-trips when PRF output is only obtained from a follow-up get() call", async () => {
    fakeAuthenticatorState.deferPrfToGet = true;
    const accountKey = new Uint8Array(32).fill(3);
    const material = await enroll(accountKey);
    fakeAuthenticatorState.deferPrfToGet = false; // authenticate uses normal get
    const recovered = await authenticateBiometric(material);
    expect(recovered.accountKey).toEqual(accountKey);
  });

  it("throws when the deferred PRF assertion is cancelled", async () => {
    fakeAuthenticatorState.deferPrfToGet = true;
    fakeAuthenticatorState.shouldCancelGet = true;
    await expect(enroll(new Uint8Array(32))).rejects.toThrow(/cancelled/i);
  });

  it("fails to authenticate against tampered material (wrong prfSalt)", async () => {
    const material = await enroll(new Uint8Array(32).fill(5));
    const tampered: BiometricKeyMaterial = {
      ...material,
      prfSalt: toBase64(new Uint8Array(32).fill(0xff)),
    };
    await expect(authenticateBiometric(tampered)).rejects.toThrow();
  });
});
