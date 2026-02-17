import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { relations, schema } from "./src/relations";

export const db = drizzle(process.env.DATABASE_URL!, { relations });

export { usersTable, type UserType } from "./src/schema/users";
export { loginsTable, type LoginType } from "./src/schema/logins";
export { sessionsTable, type SessionType } from "./src/schema/sessions";

export { schema };

export { eq } from "drizzle-orm";
