import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";

type KeyType = "ec" | "ed25519" | "rsa";

const ALGORITHM: Record<KeyType, number> = { ec: -7, ed25519: -8, rsa: -257 };

/**
 * A software WebAuthn authenticator: signs assertions the way a platform
 * authenticator does (authenticatorData || SHA-256(clientDataJSON)).
 */
export function fakeAuthenticator(type: KeyType = "ec") {
  const { privateKey, publicKey } =
    type === "ec"
      ? generateKeyPairSync("ec", { namedCurve: "P-256" })
      : type === "rsa"
        ? generateKeyPairSync("rsa", { modulusLength: 2048 })
        : generateKeyPairSync("ed25519");
  const credentialId = createHash("sha256").update(crypto.randomUUID()).digest("base64");
  let counter = 0;

  return {
    credentialId,
    algorithm: ALGORITHM[type],
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    assert(
      challenge: Uint8Array,
      {
        origin = "http://localhost:8080",
        rpId = new URL(origin).hostname,
        flags = 0x05,
        signCount = ++counter,
        key = privateKey,
      }: {
        origin?: string;
        rpId?: string;
        flags?: number;
        signCount?: number;
        key?: KeyObject;
      } = {},
    ) {
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge: Buffer.from(challenge).toString("base64url"),
          origin,
        }),
      );
      const counterBytes = Buffer.alloc(4);
      counterBytes.writeUInt32BE(signCount);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update(rpId).digest(),
        Buffer.from([flags]),
        counterBytes,
      ]);
      const signed = Buffer.concat([
        authenticatorData,
        createHash("sha256").update(clientDataJSON).digest(),
      ]);
      const signature = sign(type === "ed25519" ? null : "sha256", signed, key);
      return {
        authenticatorData: authenticatorData.toString("base64"),
        clientDataJSON: clientDataJSON.toString("base64"),
        signature: signature.toString("base64"),
      };
    },
  };
}
