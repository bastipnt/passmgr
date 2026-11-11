import { config } from "dotenv";

// DATABASE_URL from the server's env file. drizzle-kit runs from packages/db (package scripts, Dockerfile).
config({ path: "../../apps/server/.env", quiet: true });
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
