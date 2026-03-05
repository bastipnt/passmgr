import { defineRelationsPart } from "drizzle-orm";
import { usersKeysRelations, usersTable } from "./schema/users";
import { keysTable } from "./schema/keys";

export const schema = {
  usersTable,
  keysTable,
};

const mainPart = defineRelationsPart(schema);

export const relations = {
  ...mainPart,
  ...usersKeysRelations,
};
