import z from "zod";

export const ACCOUNT_EVENT_TYPES = [
  "account_created",
  "login",
  "device_login",
  "login_failed",
  "second_factor_failed",
  "password_changed",
  "password_keys_updated",
  "account_recovered",
  "email_verified",
  "two_factor_enabled",
  "two_factor_disabled",
  "backup_codes_regenerated",
  "device_credential_added",
  "device_credential_removed",
  "session_revoked",
  "other_sessions_revoked",
] as const;

export const accountEventTypeSchema = z.enum(ACCOUNT_EVENT_TYPES);
export type AccountEventType = z.infer<typeof accountEventTypeSchema>;

// The device name is sealed to the user's keypair (`deviceKeyVersion`): only the client opens it.
export const sealedAccountEventSchema = z.object({
  id: z.number().int(),
  type: accountEventTypeSchema,
  sealedDeviceName: z.string().nullable(),
  deviceKeyVersion: z.number().int().nullable(),
  newDevice: z.boolean(),
  // Unix ms.
  createdAt: z.number(),
});

export type SealedAccountEvent = z.infer<typeof sealedAccountEventSchema>;

/** An event with its device name opened (null: none, or sealed to another keypair). */
export type AccountEvent = Omit<SealedAccountEvent, "sealedDeviceName" | "deviceKeyVersion"> & {
  deviceName: string | null;
};

export const ACCOUNT_EVENTS_PAGE_SIZE = 30;

export const listAccountEventsInputSchema = z
  .object({
    // The `id` of the last event of the previous page: older ones follow.
    before: z.number().int().positive().optional(),
  })
  .strict();

export const listAccountEventsOutputSchema = z.object({
  events: z.array(sealedAccountEventSchema),
  nextBefore: z.number().int().nullable(),
});
