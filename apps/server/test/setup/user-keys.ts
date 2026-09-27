// The real client key-set builder lives in @repo/crypto; re-exported under the
// name the server tests use.
export { generateUserKeys as buildUserKeys } from "@repo/crypto";
