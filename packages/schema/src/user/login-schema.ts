import z from "zod";
import { emailSchema } from "./email-schema";
import { passwordKeySchema } from "./key-schema";

export const startLoginInputSchema = z.object({
  email: emailSchema,
  startLoginRequest: z.string(),
});

export const startLoginOutputSchema = z.object({
  loginResponse: z.string(),
  // Identifies this login handshake; must be passed back to finishLogin.
  attemptId: z.uuid(),
});

export const finishLoginInputSchema = z.object({
  email: emailSchema,
  attemptId: z.uuid(),
  finishLoginRequest: z.string(),
  // 32 bytes base64-encoded with padding
  authSalt: z.base64().length(44),
});

export const finishLoginOutputSchema = z.object({
  sessionId: z.string(),
  userPasswordKeys: passwordKeySchema,
});
