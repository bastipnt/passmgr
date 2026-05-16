// TODO: look

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateBiometric,
  BIOMETRIC_KEY,
  enrollBiometric,
  isPrfSupported,
  type BiometricKeyMaterial,
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
};

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
      if (fakeAuthenticatorState.shouldCancelCreate) return null;
      const rawId = crypto.getRandomValues(new Uint8Array(16));
      const credId = Array.from(rawId).join(",");
      fakeAuthenticatorState.credentials.set(credId, { rawId });

      const prfSaltBuf = options.publicKey.extensions?.prf?.eval?.first;
      const prfSalt = prfSaltBuf ? new Uint8Array(prfSaltBuf) : new Uint8Array(32);

      return {
        rawId: rawId.buffer,
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
      if (fakeAuthenticatorState.shouldCancelGet) return null;
      const first = options.publicKey.allowCredentials?.[0];
      if (!first) throw new Error("no allowCredentials");
      const id = first.id;
      const rawId = id instanceof ArrayBuffer ? new Uint8Array(id) : new Uint8Array(id);
      const prfSaltBuf = options.publicKey.extensions?.prf?.eval?.first;
      const prfSalt = prfSaltBuf ? new Uint8Array(prfSaltBuf) : new Uint8Array(32);

      return {
        rawId: rawId.buffer,
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
    value: { PublicKeyCredential: globalThis.PublicKeyCredential },
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
  restore = installWebAuthnMock();
});

afterEach(() => {
  restore();
});

describe("BIOMETRIC_KEY", () => {
  it("lists the six material fields in a stable order", () => {
    expect(BIOMETRIC_KEY).toEqual([
      "biometricEncryptedVaultKey",
      "biometricNonce",
      "biometricEncryptedPassword",
      "biometricPasswordNonce",
      "credentialId",
      "prfSalt",
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

describe("enrollBiometric / authenticateBiometric", () => {
  it("returns all six BIOMETRIC_KEY material fields on enrollment", async () => {
    const vaultKey = new Uint8Array(32).fill(7);
    const material = await enrollBiometric(vaultKey, "hunter2");
    for (const k of BIOMETRIC_KEY) {
      expect(typeof material[k]).toBe("string");
      expect(material[k].length).toBeGreaterThan(0);
    }
  });

  it("round-trips vaultKey and password through authenticateBiometric", async () => {
    const vaultKey = new Uint8Array(32);
    crypto.getRandomValues(vaultKey);
    const password = "correct horse battery staple";
    const material = await enrollBiometric(vaultKey, password);

    const recovered = await authenticateBiometric(material);
    expect(recovered.vaultKey).toEqual(vaultKey);
    expect(recovered.password).toBe(password);
  });

  it("produces distinct material across two enrollments of the same key+password", async () => {
    const vaultKey = new Uint8Array(32).fill(9);
    const a = await enrollBiometric(vaultKey, "p");
    const b = await enrollBiometric(vaultKey, "p");
    expect(a.credentialId).not.toBe(b.credentialId);
    expect(a.prfSalt).not.toBe(b.prfSalt);
    expect(a.biometricNonce).not.toBe(b.biometricNonce);
    expect(a.biometricEncryptedVaultKey).not.toBe(b.biometricEncryptedVaultKey);
  });

  it("throws when WebAuthn credential creation is cancelled", async () => {
    fakeAuthenticatorState.shouldCancelCreate = true;
    await expect(enrollBiometric(new Uint8Array(32), "p")).rejects.toThrow(/cancelled/i);
  });

  it("throws when the assertion during authenticate is cancelled", async () => {
    const material = await enrollBiometric(new Uint8Array(32).fill(1), "p");
    fakeAuthenticatorState.shouldCancelGet = true;
    await expect(authenticateBiometric(material)).rejects.toThrow(/cancelled/i);
  });

  it("throws when PRF is not supported by the authenticator on enrollment", async () => {
    fakeAuthenticatorState.prfSupported = false;
    await expect(enrollBiometric(new Uint8Array(32), "p")).rejects.toThrow(/PRF/i);
  });

  it("throws when PRF result is missing during authentication", async () => {
    const material = await enrollBiometric(new Uint8Array(32).fill(1), "p");
    fakeAuthenticatorState.prfSupported = false;
    await expect(authenticateBiometric(material)).rejects.toThrow(/PRF/i);
  });

  it("round-trips when PRF output is only obtained from a follow-up get() call", async () => {
    fakeAuthenticatorState.deferPrfToGet = true;
    const vaultKey = new Uint8Array(32).fill(3);
    const material = await enrollBiometric(vaultKey, "p");
    fakeAuthenticatorState.deferPrfToGet = false; // authenticate uses normal get
    const recovered = await authenticateBiometric(material);
    expect(recovered.vaultKey).toEqual(vaultKey);
    expect(recovered.password).toBe("p");
  });

  it("throws when the deferred PRF assertion is cancelled", async () => {
    fakeAuthenticatorState.deferPrfToGet = true;
    fakeAuthenticatorState.shouldCancelGet = true;
    await expect(enrollBiometric(new Uint8Array(32), "p")).rejects.toThrow(/cancelled/i);
  });

  it("fails to authenticate against tampered material (wrong prfSalt)", async () => {
    const vaultKey = new Uint8Array(32).fill(5);
    const material: BiometricKeyMaterial = {
      ...(await enrollBiometric(vaultKey, "p")),
    };
    const tampered: BiometricKeyMaterial = {
      ...material,
      prfSalt: new Uint8Array(32).fill(0xff).toBase64(),
    };
    await expect(authenticateBiometric(tampered)).rejects.toThrow();
  });
});
