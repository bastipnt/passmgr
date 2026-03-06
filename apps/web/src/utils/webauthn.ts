// TODO: maybe in different location -> @repo/client or new @repo/data\store\vault idk
import { encryptXChaCha, decryptXChaCha, hkdf, wipe, toBase64, fromBase64 } from "@repo/crypto";
import type { BiometricKeyMaterial } from "@repo/store";

// WebAuthn PRF extension types (not yet in lib.dom.d.ts)
type PRFValues = { first: ArrayBuffer };
type PRFExtensionInput = { eval: PRFValues };
type PRFExtensionCreateResult = { enabled?: boolean; results?: { first: ArrayBuffer } };
type PRFExtensionGetResult = { results?: { first: ArrayBuffer } };

export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometric(vaultKey: Uint8Array): Promise<BiometricKeyMaterial> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      // TODO: make variable
      rp: { name: "Pass Manager" },
      user: {
        // TODO: why not UUID?
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "user",
        displayName: "Pass Manager User",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      extensions: {
        prf: { eval: { first: prfSalt.buffer as ArrayBuffer } } as PRFExtensionInput,
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("WebAuthn credential creation cancelled");

  const credentialId = toBase64(new Uint8Array(credential.rawId));
  const createExtensions = credential.getClientExtensionResults() as Record<string, unknown>;
  const prfResult = createExtensions.prf as PRFExtensionCreateResult | undefined;

  let prfOutput: ArrayBuffer;

  if (prfResult?.results?.first) {
    // PRF result returned directly from create (some browsers)
    prfOutput = prfResult.results.first;
  } else if (prfResult?.enabled !== false) {
    // Need a separate get() call to obtain PRF output
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credential.rawId, type: "public-key" }],
        userVerification: "required",
        extensions: {
          prf: { eval: { first: prfSalt.buffer as ArrayBuffer } } as PRFExtensionInput,
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) throw new Error("WebAuthn PRF assertion cancelled");

    const getExtensions = assertion.getClientExtensionResults() as Record<string, unknown>;
    const getPrf = getExtensions.prf as PRFExtensionGetResult | undefined;
    if (!getPrf?.results?.first)
      throw new Error("PRF extension not supported by this authenticator");
    prfOutput = getPrf.results.first;
  } else {
    throw new Error("PRF extension not supported by this authenticator");
  }

  const biometricKek = await hkdf(new Uint8Array(prfOutput), "biometricKek");
  const [biometricEncryptedVaultKey, biometricNonce] = encryptXChaCha(biometricKek, vaultKey);
  wipe(biometricKek);

  return {
    biometricEncryptedVaultKey,
    biometricNonce,
    credentialId,
    prfSalt: toBase64(prfSalt),
  };
}

export async function authenticateBiometric(material: BiometricKeyMaterial): Promise<Uint8Array> {
  const credentialId = fromBase64(material.credentialId);
  const prfSalt = fromBase64(material.prfSalt);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credentialId.buffer as ArrayBuffer, type: "public-key" }],
      userVerification: "required",
      extensions: {
        prf: { eval: { first: prfSalt.buffer as ArrayBuffer } } as PRFExtensionInput,
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Biometric authentication cancelled");

  const extensions = assertion.getClientExtensionResults() as Record<string, unknown>;
  const prfResult = extensions.prf as PRFExtensionGetResult | undefined;

  if (!prfResult?.results?.first) {
    throw new Error("PRF extension not supported");
  }

  const biometricKek = await hkdf(new Uint8Array(prfResult.results.first), "biometricKek");
  const vaultKey = decryptXChaCha(
    biometricKek,
    material.biometricEncryptedVaultKey,
    material.biometricNonce,
  );
  wipe(biometricKek);

  return vaultKey;
}
