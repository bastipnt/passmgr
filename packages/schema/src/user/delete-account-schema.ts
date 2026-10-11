import z from "zod";

/** Deleting the account: the master password, checked by a fresh login. */
export const deleteAccountFormSchema = z.object({
  password: z.string().min(1, "Enter your master password"),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;
