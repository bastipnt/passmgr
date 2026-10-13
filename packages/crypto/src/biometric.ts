import { fromBase64, toBase64 } from "@repo/util";
import { hkdf } from "./hash";
import { unwrapAccountKey, wrapAccountKey } from "./user-keys";
import { wipe } from "./util/secrets-utils";

export const BIOMETRIC_REQUIRED_KEY = [
  "biometricEncryptedAccountKey",
  "biometricNonce",
  "credentialId",
  "prfSalt",
] as const;

export const BIOMETRIC_KEY = [...BIOMETRIC_REQUIRED_KEY, "biometricDeviceLogin"] as const;

/**
 * `biometricDeviceLogin` is set once the server holds the credential's public
 * key (linked profiles): the same prompt then also logs in to the server.
 */
export type BiometricKeyMaterial = Record<(typeof BIOMETRIC_REQUIRED_KEY)[number], string> & {
  biometricDeviceLogin?: string;
};

/** The credential's public key (SPKI, base64) and its COSE algorithm, for the server. */
export type DeviceCredentialPublicKey = { publicKey: string; algorithm: number };

export type EnrolledBiometric = {
  material: BiometricKeyMaterial;
  /** Undefined when the browser can't hand out the public key. */
  devicePublicKey?: DeviceCredentialPublicKey;
};

/** The parts of a WebAuthn assertion the server verifies, base64. */
export type DeviceAssertion = {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

// WebAuthn PRF extension types (not yet in lib.dom.d.ts)
type PRFValues = { first: ArrayBuffer };
type PRFExtensionInput = { eval: PRFValues };
type PRFExtensionCreateResult = { enabled?: boolean; results?: { first: ArrayBuffer } };
type PRFExtensionGetResult = { results?: { first: ArrayBuffer } };

type ClientCapabilities = Partial<
  Record<"userVerifyingPlatformAuthenticator" | "extension:prf", boolean>
>;
type CredentialWithCapabilities = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<ClientCapabilities>;
};

/**
 * Whether this browser can enroll a biometric unlock: a user-verifying platform
 * authenticator and, where the browser reports it, the PRF extension. Browsers
 * without `getClientCapabilities` can't tell PRF support upfront; enrolling
 * still fails cleanly there.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const credential = window.PublicKeyCredential as CredentialWithCapabilities;
  try {
    const capabilities = await credential.getClientCapabilities?.();
    if (capabilities?.["extension:prf"] === false) return false;
    if (capabilities?.userVerifyingPlatformAuthenticator !== undefined)
      return capabilities.userVerifyingPlatformAuthenticator;
    return await credential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function relyingPartyId() {
  return window.location.hostname;
}

export type BiometricEnrollOptions = {
  /** Shown by the OS next to the credential. */
  rpName: string;
  /** Tells the credentials of several profiles on one device apart. */
  userName: string;
};

/**
 * Only the account key is stored, wrapped with the PRF output. Logging in to
 * the server again goes through the credential itself (`devicePublicKey`,
 * registered with the server), never a stored password or password equivalent.
 */
export async function enrollBiometric(
  accountKey: Uint8Array,
  { rpName, userName }: BiometricEnrollOptions,
): Promise<EnrolledBiometric> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const rpId = relyingPartyId();

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId, name: rpName },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -8, type: "public-key" }, // EdDSA
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
        rpId,
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
  const [biometricEncryptedAccountKey, biometricNonce] = wrapAccountKey(biometricKek, accountKey);
  const material: BiometricKeyMaterial = {
    biometricEncryptedAccountKey,
    biometricNonce,
    credentialId,
    prfSalt: toBase64(prfSalt),
  };
  wipe(biometricKek);
  return { material, devicePublicKey: credentialPublicKey(credential) };
}

function credentialPublicKey(
  credential: PublicKeyCredential,
): DeviceCredentialPublicKey | undefined {
  const response = credential.response as Partial<AuthenticatorAttestationResponse>;
  const publicKey = response.getPublicKey?.();
  const algorithm = response.getPublicKeyAlgorithm?.();
  if (!publicKey || algorithm === undefined) return undefined;
  return { publicKey: toBase64(new Uint8Array(publicKey)), algorithm };
}

/**
 * One prompt: the PRF output opens the account key, and with a `challenge`
 * (a device login's, `deviceLoginChallenge`) the signed assertion comes back
 * for the server.
 */
export async function authenticateBiometric(
  material: BiometricKeyMaterial,
  challenge?: Uint8Array,
): Promise<{ accountKey: Uint8Array; assertion?: DeviceAssertion }> {
  const credentialId = fromBase64(material.credentialId);
  const prfSalt = fromBase64(material.prfSalt);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: (challenge ?? crypto.getRandomValues(new Uint8Array(32))).slice()
        .buffer as ArrayBuffer,
      rpId: relyingPartyId(),
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
  const accountKey = unwrapAccountKey(
    biometricKek,
    material.biometricEncryptedAccountKey,
    material.biometricNonce,
  );
  wipe(biometricKek);

  if (!challenge) return { accountKey };
  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    accountKey,
    assertion: {
      authenticatorData: toBase64(new Uint8Array(response.authenticatorData)),
      clientDataJSON: toBase64(new Uint8Array(response.clientDataJSON)),
      signature: toBase64(new Uint8Array(response.signature)),
    },
  };
}
