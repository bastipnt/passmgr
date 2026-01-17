import { z } from "zod";

export const entrySchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type Entry = z.infer<typeof entrySchema>;
