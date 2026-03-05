import { loggedProcedure } from "../logger";
import { opaque, serverKey, serverSetup } from "../opaque";
import { router } from "../trpc";
import { db, keysTable, usersTable } from "@repo/db";
import { encryptEmail, hashEmail } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import {
  finishRegistrationInputSchema,
  startRegistrationInputSchema,
  startRegistrationOutputSchema,
} from "@repo/schema";

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
      const { email, registrationRecord, userKeys } = input;

      const [encryptedEmail, emailNonce, emailEncryptionKeySalt] = await encryptEmail(
        serverKey,
        email,
      );
      const emailHash = toBase64(await hashEmail(serverKey, email));

      // If user is already registered this will return an empty array
      const dbUsers = await db
        .insert(usersTable)
        .values({
          encryptedEmail,
          emailNonce,
          emailEncryptionKeySalt,
          emailHash,
          registrationRecord,
        })
        .onConflictDoNothing({ target: usersTable.emailHash })
        .returning({ userId: usersTable.userId });

      // fails if there is already a user with that email
      if (dbUsers.length === 0) return;

      const { userId } = dbUsers[0];
      await db.insert(keysTable).values({ userId, ...userKeys });
    }),
});
