import z from "zod";
import { passwordKeySchema } from "./key-schema";

export const startLoginInputSchema = z.object({
  email: z.email(),
  startLoginRequest: z.string(),
});

export const startLoginOutputSchema = z.object({
  loginResponse: z.string(),
});

export const finishLoginInputSchema = z.object({
  email: z.email(),
  finishLoginRequest: z.string(),
  // 32 bytes base64-encoded with padding
  authSalt: z.base64().length(44),
});

export const finishLoginOutputSchema = z.object({
  sessionId: z.string(),
  userPasswordKeys: passwordKeySchema,
});
