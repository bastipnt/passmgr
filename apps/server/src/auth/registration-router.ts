import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { TRPCError } from "@trpc/server";
import { loggedProcedure } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
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

      let req: RegistrationRequest;
      try {
        req = RegistrationRequest.deserialize(opaqueConfig, b64ToBytes(registrationRequest));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "invalid registration request" });
      }

      // credential_identifier = email matches the prior serenity userIdentifier.
      const resp = await opaqueServer.registerInit(req, email);
      if (resp instanceof Error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "registration failed" });
      }

      return { registrationResponse: bytesToB64(resp.serialize()) };
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
