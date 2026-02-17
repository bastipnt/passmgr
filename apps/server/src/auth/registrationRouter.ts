import z from "zod";
import { loggedProcedure } from "../logger";
import { opaque, serverKey, serverSetup } from "../opaque";
import { router } from "../trpc";
import { db, usersTable } from "@repo/db";
import { encryptEmail, hashEmail } from "@repo/crypto";
import { toBase64 } from "@repo/crypto/src/util/format";

const startRegistrationInputSchema = z.object({
  email: z.email(),
  registrationRequest: z.string(),
});

const startRegistrationOutputSchema = z.object({
  registrationResponse: z.string(),
});

const finishRegistrationInputSchema = z.object({
  email: z.string(),
  registrationRecord: z.string(),
});

export const registrationRouter = router({
  startRegistration: loggedProcedure
    .input(startRegistrationInputSchema)
    .output(startRegistrationOutputSchema)
    .mutation(async ({ input }) => {
      const { email, registrationRequest } = input;

      const { registrationResponse } = opaque.server.createRegistrationResponse({
        serverSetup,
        userIdentifier: email,
        registrationRequest,
      });

      return { registrationResponse };
    }),

  finishRegistration: loggedProcedure
    .input(finishRegistrationInputSchema)
    .mutation(async ({ input }) => {
      const { email, registrationRecord } = input;

      const [encryptedEmail, emailNonce, emailEncryptionKeySalt] = await encryptEmail(
        serverKey,
        email,
      );
      const emailHash = toBase64(await hashEmail(serverKey, email));

      await db
        .insert(usersTable)
        .values({
          encryptedEmail,
          emailNonce,
          emailEncryptionKeySalt,
          emailHash,
          registrationRecord,
        })
        .onConflictDoNothing({ target: usersTable.emailHash });
    }),
});
