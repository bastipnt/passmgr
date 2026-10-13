import { defineRelationsPart } from "drizzle-orm";
import { deviceCredentialsTable } from "./schema/device-credentials";
import { keysTable } from "./schema/keys";
import { recordsTable } from "./schema/records";
import { userBackupCodesTable, userTotpTable } from "./schema/two-factor";
import { userKeyPairsTable } from "./schema/user-key-pairs";
import { usersTable } from "./schema/users";
import { vaultKeyLinksTable, vaultMembersTable, vaultsTable } from "./schema/vaults";

export const schema = {
  usersTable,
  keysTable,
  recordsTable,
  vaultsTable,
  vaultMembersTable,
  vaultKeyLinksTable,
  userKeyPairsTable,
  userTotpTable,
  userBackupCodesTable,
  deviceCredentialsTable,
};

const mainPart = defineRelationsPart(schema);

const usersKeysRelations = defineRelationsPart({ usersTable, keysTable }, (r) => ({
  usersTable: {
    key: r.one.keysTable({
      from: r.usersTable.userId,
      to: r.keysTable.userId,
      where: {
        valid_to: { isNull: true },
      },
    }),
  },
}));

export const relations = {
  ...mainPart,
  ...usersKeysRelations,
};
