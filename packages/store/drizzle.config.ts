import { defineConfig } from "drizzle-kit";

// Local (on-device) SQLite schema. `pnpm migrations:generate` writes the SQL to
// ./drizzle and bundles it into src/migrations.generated.ts for the runner.
export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/tables.ts",
  dialect: "sqlite",
});
