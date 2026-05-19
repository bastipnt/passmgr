import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const composeFile = resolve(repoRoot, "docker-compose.test.yml");
const envFile = resolve(__dirname, ".env.test");
const envLocalFile = resolve(__dirname, ".env.test.local");

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_STACK === "1") {
    console.log("[e2e] E2E_KEEP_STACK=1 — leaving docker stack running");
    return;
  }

  spawnSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "--env-file",
      envFile,
      "--env-file",
      envLocalFile,
      "down",
      "-v",
      "--remove-orphans",
    ],
    { stdio: "inherit", cwd: repoRoot },
  );
}
