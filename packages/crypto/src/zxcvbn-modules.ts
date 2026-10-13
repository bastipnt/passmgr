/** zxcvbn and its dictionaries as separate chunks, loaded on first use. */
export function loadZxcvbnModules() {
  return Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]);
}
