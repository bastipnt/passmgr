import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { OpaqueID, getOpaqueConfig } from "@cloudflare/opaque-ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const composeFile = resolve(repoRoot, "docker-compose.test.yml");
const envFile = resolve(__dirname, ".env.test");
const envLocalFile = resolve(__dirname, ".env.test.local");

const WEB_PORT = process.env.WEB_PORT ?? "8080";

function compose(args: string[]) {
  const result = spawnSync(
    "docker",
    ["compose", "-f", composeFile, "--env-file", envFile, "--env-file", envLocalFile, ...args],
    {
      stdio: "inherit",
      env: process.env,
      cwd: repoRoot,
    },
  );
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(" ")} failed (exit ${result.status})`);
  }
}

async function waitForUrl(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`URL ${url} not reachable within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const oprfSeed = crypto.getRandomValues(new Uint8Array(cfg.hash.Nh));
  const ake = await cfg.ake.generateAuthKeyPair();
  const opaqueOprfSeed = Buffer.from(oprfSeed).toString("base64");
  const opaqueAkePrivateKey = Buffer.from(Uint8Array.from(ake.private_key)).toString("base64");
  // Stable secret used only for email HMAC/encryption — independent of OPAQUE.
  const opaqueServerSetup = randomBytes(32).toString("base64");
  const postgresPassword = randomBytes(24).toString("base64url");

  writeFileSync(
    envLocalFile,
    [
      `OPAQUE_OPRF_SEED=${opaqueOprfSeed}`,
      `OPAQUE_AKE_PRIVATE_KEY=${opaqueAkePrivateKey}`,
      `OPAQUE_SERVER_SETUP=${opaqueServerSetup}`,
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "",
    ].join("\n"),
  );

  try {
    compose(["down", "-v", "--remove-orphans"]);
  } catch {
    // ignore — first run, nothing to stop
  }

  compose(["up", "-d", "--build", "--wait"]);

  await waitForUrl(`http://localhost:${WEB_PORT}/`, 60_000);
  await waitForUrl(`http://localhost:${WEB_PORT}/trpc/appConfig.getConfig`, 60_000);

  const env = readFileSync(envLocalFile, "utf8");
  for (const key of ["OPAQUE_OPRF_SEED", "OPAQUE_AKE_PRIVATE_KEY", "OPAQUE_SERVER_SETUP"]) {
    if (!env.includes(`${key}=`)) {
      throw new Error(`${key} missing from .env.test.local`);
    }
  }
}
