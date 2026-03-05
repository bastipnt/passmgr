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
  email: z.string(),
  finishLoginRequest: z.string(),
  authSalt: z.string(),
});

export const finishLoginOutputSchema = z.object({
  sessionId: z.string(),
  userPasswordKeys: passwordKeySchema,
});
