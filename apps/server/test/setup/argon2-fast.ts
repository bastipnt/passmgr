import { setPasswordKekParams } from "@repo/crypto";
import { relaxArgonBounds } from "@repo/schema/testing/relax-argon-bounds";

relaxArgonBounds();

// Switch Argon2id to a CI-cheap cost. Production code paths are unchanged —
// the prod default stays in packages/crypto/src/hash.ts.
setPasswordKekParams({ t: 1, m: 8, p: 1 });
