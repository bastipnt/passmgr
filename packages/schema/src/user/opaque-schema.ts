import { canonicalBase64 } from "../base64-schema";

/** A serialized OPAQUE message (base64; P-256 messages are a few hundred bytes). */
export const opaqueMessageSchema = canonicalBase64().min(1).max(1024);
