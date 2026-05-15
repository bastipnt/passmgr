import { defineRelationsPart } from "drizzle-orm";
import { usersKeysRelations, usersTable } from "./schema/users";
import { keysTable } from "./schema/keys";
import { recordsTable } from "./schema/records";

export const schema = {
  usersTable,
  keysTable,
  recordsTable,
};

const mainPart = defineRelationsPart(schema);

export const relations = {
  ...mainPart,
  ...usersKeysRelations,
};
