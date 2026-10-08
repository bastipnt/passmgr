import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportEnvelope,
  type ExportKdf,
} from "@repo/schema";
import { fromString, toBase64 } from "@repo/util";
import { decryptXChaChaWithAAD, encryptXChaChaWithAAD } from "./util/aead";

/*
 * The encrypted export (ADR 0001 D12): the export JSON sealed with
 * XChaCha20-Poly1305 under an Argon2id key from a password chosen for the
 * file. It holds no account or vault keys, so it opens on its own. The caller
 * derives the key (`exportKdf` names the salt and cost; in a worker on web).
 *
 * The AAD is purpose-only. Changing the KDF parameters or the salt yields
 * another key, which fails the tag just like a wrong password.
 */

const EXPORT_AAD = fromString(`passmgr/export/v${EXPORT_FORMAT_VERSION}`);

/** The KDF block for a new export: Argon2id with the given salt and cost. */
export function exportKdf(
  salt: Uint8Array,
  params: { t: number; m: number; p: number },
): ExportKdf {
  return { algorithm: "argon2id", salt: toBase64(salt), t: params.t, m: params.m, p: params.p };
}

export function sealExport(key: Uint8Array, kdf: ExportKdf, json: string): ExportEnvelope {
  const [data, nonce] = encryptXChaChaWithAAD(key, json, EXPORT_AAD);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    encrypted: true,
    kdf,
    cipher: "xchacha20poly1305",
    nonce,
    data,
  };
}

/** The export JSON. Throws when the key (password) is wrong or the file was changed. */
export function openExport(key: Uint8Array, envelope: ExportEnvelope): string {
  return new TextDecoder().decode(
    decryptXChaChaWithAAD(key, envelope.data, envelope.nonce, EXPORT_AAD),
  );
}
