import z from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH);
