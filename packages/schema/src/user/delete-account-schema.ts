import z from "zod";

/** Deleting the account: the master password, checked by a fresh login. */
export const deleteAccountFormSchema = z.object({
  password: z.string().min(1, "Enter your password"),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;
