import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// DATABASE_URL comes from the server's env file (resolved from this file, not the cwd: the server imports this
// package from apps/server). Never overrides vars already set, e.g. by `dotenvx run` or the test setup; the file is
// absent in the Docker image, where compose sets the env.
config({ path: fileURLToPath(new URL("../../apps/server/.env", import.meta.url)), quiet: true });
import { drizzle } from "drizzle-orm/node-postgres";
import { relations, schema } from "./src/relations";

export const db = drizzle(process.env.DATABASE_URL!, { relations });

export * from "./src/schema/device-credentials";
export * from "./src/schema/keys";
export * from "./src/schema/records";
export * from "./src/schema/two-factor";
export * from "./src/schema/user-key-pairs";
export * from "./src/schema/users";
export * from "./src/schema/vaults";

export { schema };
