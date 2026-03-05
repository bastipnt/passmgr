import { defineRelationsPart } from "drizzle-orm";
import { usersKeysRelations, usersTable } from "./schema/users";
import { keysTable } from "./schema/keys";
import { itemsTable } from "./schema/items";

export const schema = {
  usersTable,
  keysTable,
  itemsTable,
};

const mainPart = defineRelationsPart(schema);

export const relations = {
  ...mainPart,
  ...usersKeysRelations,
};
