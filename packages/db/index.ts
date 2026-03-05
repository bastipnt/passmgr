import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { relations, schema } from "./src/relations";

export const db = drizzle(process.env.DATABASE_URL!, { relations });

export * from "./src/schema/users";
export * from "./src/schema/keys";
export * from "./src/schema/items";

export { schema };

export { eq } from "drizzle-orm";
