import z from "zod";

export const appConfigOutputSchema = z.object({
  registrationEnabled: z.boolean(),
  // The server sends codes to verify an account's email; without, every account counts as verified.
  emailVerification: z.boolean(),
});

export type AppConfig = z.infer<typeof appConfigOutputSchema>;
