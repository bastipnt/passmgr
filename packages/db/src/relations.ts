import { defineRelationsPart } from "drizzle-orm";
import { keysTable } from "./schema/keys";
import { recordsTable } from "./schema/records";
import { userKeyPairsTable } from "./schema/user-key-pairs";
import { usersTable } from "./schema/users";
import { vaultMembersTable, vaultsTable } from "./schema/vaults";

export const schema = {
  usersTable,
  keysTable,
  recordsTable,
  vaultsTable,
  vaultMembersTable,
  userKeyPairsTable,
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
