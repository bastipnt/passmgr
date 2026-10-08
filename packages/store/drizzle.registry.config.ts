import { defineConfig } from "drizzle-kit";

// The device-level profile registry: its own database, its own migrations.
// `pnpm migrations:generate` writes the SQL to ./drizzle-registry and bundles it
// into src/registry-migrations.generated.ts.
export default defineConfig({
  out: "./drizzle-registry",
  schema: "./src/schema/registry-tables.ts",
  dialect: "sqlite",
});
