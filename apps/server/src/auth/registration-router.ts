import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { encryptEmail, hashEmail, normalizeEmail } from "@repo/crypto";
import {
  db,
  keysTable,
  userKeyPairsTable,
  usersTable,
  vaultKeyLinksTable,
  vaultMembersTable,
  vaultsTable,
} from "@repo/db";
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
import { isUniqueViolation } from "../util/general";
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
  const emailMatches = !found?.email || normalizeEmail(found.email) === email;

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
      const { email, registrationRecord, userKeys, personalVault, userKeyPair, vaults, invite } =
        input;
      await assertRegistrationAllowed(email, invite, { consume: true });

      const [encryptedEmail, emailNonce, emailEncryptionKeySalt] = await encryptEmail(
        serverKey,
        email,
      );
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const created = await db
        .transaction(async (tx) => {
          const [user] = await tx
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
          if (!user) return false;

          await tx.insert(keysTable).values({ userId: user.userId, ...userKeys });
          await tx.insert(userKeyPairsTable).values({ userId: user.userId, ...userKeyPair });
          // The default vault and, linking a local vault (ADR 0001 D9), its other vaults,
          // owned by the new user like `vault.create` would make them. Keys come wrapped
          // under the account key, a rotated vault's earlier keys under their successors.
          const all = [
            { ...personalVault, kind: "personal" as const },
            ...(vaults ?? []).map((vault) => ({ ...vault, kind: "shared" as const })),
          ];
          await tx.insert(vaultsTable).values(
            all.map(({ vaultId, kind, keyVersion, encryptedMeta, metaEncryptionNonce }) => ({
              vaultId,
              ownerId: user.userId,
              kind,
              keyVersion,
              encryptedMeta,
              metaEncryptionNonce,
            })),
          );
          await tx.insert(vaultMembersTable).values(
            all.map(({ vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce }) => ({
              vaultId,
              keyVersion,
              encryptedVaultKey,
              vaultKeyEncryptionNonce,
              userId: user.userId,
              role: "owner" as const,
            })),
          );
          const links = all.flatMap(({ vaultId, previousKeys }) =>
            previousKeys.map((link) => ({ vaultId, ...link })),
          );
          if (links.length > 0) await tx.insert(vaultKeyLinksTable).values(links);
          return true;
        })
        .catch((error: unknown) => {
          // A client-chosen vaultId (or wrap, or public key) that already exists: reject the
          // request instead of surfacing a 500. The transaction rolled back.
          if (!isUniqueViolation(error)) throw error;
          log?.warn({ emailHash }, "auth.register.key_conflict");
          throw new TRPCError({ code: "BAD_REQUEST", message: "registration failed" });
        });

      if (!created) {
        log?.warn({ emailHash }, "auth.register.duplicate");
        return;
      }

      log?.info({ emailHash, viaInvite: invite !== undefined }, "auth.register.success");
    }),
});
