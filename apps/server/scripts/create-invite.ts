// Mint a single-use registration invite while REGISTRATION_DISABLED=true.
// Run inside the server container (needs REDIS_HOST / REDIS_PORT):
//   docker compose -f docker-compose.prod.yml exec server \
//     bun apps/server/scripts/create-invite.ts [--email a@b.c] [--ttl 24] [--url https://host]
//
// The invitee opens the printed link and registers in the web app. Their
// password and recovery key never touch the server — OPAQUE runs client-side.

import { parseArgs } from "node:util";
import { redis } from "../src/redis";
import { createInvite } from "../src/util/redis-utils";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    ttl: { type: "string", default: "24" },
    url: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: create-invite.ts [--email <addr>] [--ttl <hours>] [--url <base>]

  --email  Only allow this email to register with the invite
  --ttl    Hours until the invite expires (default 24)
  --url    Web app base URL for the printed link (default: $CORS_ORIGIN)`);
  process.exit(0);
}

const ttlHours = Number(values.ttl);
if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
  console.error(`Invalid --ttl: ${values.ttl}`);
  process.exit(1);
}

const baseUrl = (values.url ?? process.env.CORS_ORIGIN)?.replace(/\/+$/, "");
const ttlSeconds = Math.round(ttlHours * 60 * 60);

try {
  const code = await createInvite({ email: values.email }, ttlSeconds);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  console.log(baseUrl ? `${baseUrl}/register?invite=${code}` : `Invite code: ${code}`);
  console.log(
    `Single use, expires ${expiresAt}${values.email ? `, only for ${values.email}` : ""}`,
  );
} finally {
  await redis.quit();
}
