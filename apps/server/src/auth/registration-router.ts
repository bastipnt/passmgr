import { TRPCError } from "@trpc/server";
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

function assertRegistrationEnabled() {
  if (process.env.REGISTRATION_DISABLED === "true") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Registration is disabled",
    });
  }
}

export const registrationRouter = router({
  startRegistration: loggedProcedure
    .input(startRegistrationInputSchema)
    .output(startRegistrationOutputSchema)
    .mutation(async ({ input }) => {
      assertRegistrationEnabled();
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
    .mutation(async ({ input, ctx }) => {
      assertRegistrationEnabled();
      const log = ctx.req?.log;
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
      const firstUser = dbUsers[0];
      if (!firstUser) {
        log?.warn({ emailHash }, "auth.register.duplicate");
        return;
      }

      const { userId } = firstUser;
      await db.insert(keysTable).values({ userId, ...userKeys });
      log?.info({ emailHash }, "auth.register.success");
    }),
});
