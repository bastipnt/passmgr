import { setPasswordKekParams } from "@repo/crypto";
import { setArgonBounds } from "@repo/schema";

// Relax server-side schema bounds first so the fast params below validate.
setArgonBounds({
  tMin: 1,
  tMax: 4,
  mMin: 8,
  mMax: 256 * 1024,
  mMultipleOf: 1,
  pMin: 1,
  pMax: 4,
});

// Switch Argon2id to a CI-cheap cost. Production code paths are unchanged —
// the prod default stays in packages/crypto/src/hash.ts.
setPasswordKekParams({ t: 1, m: 8, p: 1 });
