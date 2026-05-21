// Default Argon2id implementation (web + Node + tests). Mobile gets a native
// override via the sibling `argon2-impl.native.ts` (Metro picks `.native.ts`
// automatically for iOS/Android bundles).
export { argon2idAsync, type ArgonOpts } from "@noble/hashes/argon2.js";
