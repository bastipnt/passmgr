import { defineRelationsPart } from "drizzle-orm";
import { usersLoginsRelations, usersSessionsRelations, usersTable } from "./schema/users";
import { loginsTable } from "./schema/logins";
import { sessionsTable } from "./schema/sessions";

export const schema = {
  usersTable,
  loginsTable,
  sessionsTable,
};

const mainPart = defineRelationsPart(schema);

export const relations = {
  ...mainPart,
  ...usersLoginsRelations,
  ...usersSessionsRelations,
};
