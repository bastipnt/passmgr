import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { encryptEmail, hashEmail } from "@repo/crypto";
import { db, keysTable, usersTable } from "@repo/db";
import {
  finishRegistrationInputSchema,
  startRegistrationInputSchema,
  startRegistrationOutputSchema,
} from "@repo/schema";
import { toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { loggedProcedure } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import { consumeInvite, getInvite } from "../util/redis-utils";

/**
 * Open registration lets anyone through. When REGISTRATION_DISABLED=true a
 * valid invite (minted via `scripts/create-invite.ts`) is required: peeked at
 * start, atomically consumed at finish so it can only create one account.
 */
async function assertRegistrationAllowed(
  email: string,
  invite: string | undefined,
  { consume }: { consume: boolean },
) {
  if (process.env.REGISTRATION_DISABLED !== "true") return;

  const found = invite ? await (consume ? consumeInvite(invite) : getInvite(invite)) : undefined;
  const emailMatches = !found?.email || found.email.toLowerCase() === email.toLowerCase();

  if (!found || !emailMatches) {
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
      const { email, registrationRequest, invite } = input;
      await assertRegistrationAllowed(email, invite, { consume: false });

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
      const log = ctx.req?.log;
      const { email, registrationRecord, userKeys, invite } = input;
      await assertRegistrationAllowed(email, invite, { consume: true });

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
      log?.info({ emailHash, viaInvite: invite !== undefined }, "auth.register.success");
    }),
});
