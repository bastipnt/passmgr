import z from "zod";

/** A serialized OPAQUE message (base64; P-256 messages are a few hundred bytes). */
export const opaqueMessageSchema = z.string().min(1).max(1024);
