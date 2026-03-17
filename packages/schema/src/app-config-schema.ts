import z from "zod";

export const appConfigOutputSchema = z.object({
  registrationEnabled: z.boolean(),
});

export type AppConfig = z.infer<typeof appConfigOutputSchema>;
