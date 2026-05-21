// Generate one-time OPAQUE server secrets for @cloudflare/opaque-ts.
// Run:  bun apps/server/scripts/opaque-cf-bootstrap.ts
//
// Copy the printed lines into apps/server/.env. These secrets are equivalent
// to the master OPAQUE server key — rotating either invalidates every
// registration. Keep them out of source control and back them up offline.

import { OpaqueID, getOpaqueConfig } from "@cloudflare/opaque-ts";

const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
const oprfSeed = crypto.getRandomValues(new Uint8Array(cfg.hash.Nh));
const ake = await cfg.ake.generateAuthKeyPair();
const privBytes = Uint8Array.from(ake.private_key);

console.log(`OPAQUE_OPRF_SEED=${Buffer.from(oprfSeed).toString("base64")}`);
console.log(`OPAQUE_AKE_PRIVATE_KEY=${Buffer.from(privBytes).toString("base64")}`);
console.log(`# OPAQUE_SERVER_IDENTITY=passmgr   # optional, defaults to "passmgr"`);
