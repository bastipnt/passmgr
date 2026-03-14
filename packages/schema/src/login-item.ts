import { z } from "zod";

const extraFieldSchema = z.object({
  type: z.enum(["text", "secret"]),
  title: z.string(),
  value: z.string().optional(),
});

export const loginItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  username: z.string().optional(), // TODO: do I need max length here?
  password: z.string().optional(),
  websites: z
    .array(
      z.object({
        value: z.union([z.literal(""), z.url("Must be a valid URL")]),
      }),
    )
    .optional(),
  totp: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
  extraFields: z.array(extraFieldSchema).optional(),
});

export type LoginItem = z.infer<typeof loginItemSchema>;
