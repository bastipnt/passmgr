// Default Argon2id implementation (web + Node + tests). Mobile gets a native
// override via the sibling `argon2-impl.native.ts` (Metro picks `.native.ts`
// automatically for iOS/Android bundles).
export { type ArgonOpts, argon2idAsync } from "@noble/hashes/argon2.js";
