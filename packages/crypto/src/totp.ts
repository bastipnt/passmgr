import { createGuardrails } from "@otplib/core";
import { generate } from "otplib";

const guardrails = createGuardrails({
  MIN_SECRET_BYTES: 10,
});

export async function getToken(secret: string | Uint8Array) {
  return await generate({ secret: secret, guardrails });
}

export { getRemainingTime } from "@otplib/totp";
