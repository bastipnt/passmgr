// Standalone proof: @cloudflare/opaque-ts completes a full OPAQUE handshake.
// Run from repo root:  bun apps/server/scripts/opaque-cf-e2e.ts
//
// This is a prototype harness — it does not touch the DB, tRPC, or Redis. It
// exists to validate that the client/server libs interoperate before we commit
// to migrating apps/server/src/auth/login-router.ts off @serenity-kit/opaque.

import {
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
  KE1,
  KE2,
  KE3,
  RegistrationRequest,
  RegistrationResponse,
  RegistrationRecord,
  getOpaqueConfig,
} from "@cloudflare/opaque-ts";

function bytesEq(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main() {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const oprf_seed = Array.from(crypto.getRandomValues(new Uint8Array(cfg.hash.Nh)));
  const ake_keypair = await cfg.ake.generateAuthKeyPair();
  const server_identity = "passmgr";
  const credential_id = "user-123";
  const client_identity = "alice@example.com";

  // --- register
  const regClient = new OpaqueClient(cfg);
  const req = await regClient.registerInit("hunter2");
  if (req instanceof Error) throw req;

  const regServer = new OpaqueServer(cfg, oprf_seed, ake_keypair, server_identity);
  const regResp = await regServer.registerInit(
    RegistrationRequest.deserialize(cfg, req.serialize()),
    credential_id,
  );
  if (regResp instanceof Error) throw regResp;

  const reg = await regClient.registerFinish(
    RegistrationResponse.deserialize(cfg, regResp.serialize()),
    server_identity,
    client_identity,
  );
  if (reg instanceof Error) throw reg;
  console.log("register OK, export_key length:", reg.export_key.length);

  const record_bytes = reg.record.serialize();

  // --- login (correct password)
  const authClient = new OpaqueClient(cfg);
  const ke1 = await authClient.authInit("hunter2");
  if (ke1 instanceof Error) throw ke1;

  const authServer = new OpaqueServer(cfg, oprf_seed, ake_keypair, server_identity);
  const init = await authServer.authInit(
    KE1.deserialize(cfg, ke1.serialize()),
    RegistrationRecord.deserialize(cfg, record_bytes),
    credential_id,
    client_identity,
  );
  if (init instanceof Error) throw init;

  const fin = await authClient.authFinish(
    KE2.deserialize(cfg, init.ke2.serialize()),
    server_identity,
    client_identity,
  );
  if (fin instanceof Error) throw fin;

  const verify = authServer.authFinish(KE3.deserialize(cfg, fin.ke3.serialize()), init.expected);
  if (verify instanceof Error) throw verify;

  console.log("login OK, session_keys match:", bytesEq(fin.session_key, verify.session_key));

  // --- login (wrong password)
  const badClient = new OpaqueClient(cfg);
  const badKe1 = await badClient.authInit("WRONG");
  if (badKe1 instanceof Error) throw badKe1;

  const badInit = await authServer.authInit(
    KE1.deserialize(cfg, badKe1.serialize()),
    RegistrationRecord.deserialize(cfg, record_bytes),
    credential_id,
    client_identity,
  );
  if (badInit instanceof Error) throw badInit;

  const badFin = await badClient.authFinish(
    KE2.deserialize(cfg, badInit.ke2.serialize()),
    server_identity,
    client_identity,
  );
  console.log("wrong-password rejected client-side:", badFin instanceof Error);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
