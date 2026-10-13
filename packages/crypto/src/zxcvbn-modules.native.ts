declare const require: (id: string) => unknown;

type ZxcvbnModules = [
  typeof import("@zxcvbn-ts/core"),
  typeof import("@zxcvbn-ts/language-common"),
  typeof import("@zxcvbn-ts/language-en"),
];

/**
 * Metro's dev server can't serve these as async chunks ("Requiring unknown module"), so on
 * native they're in the main bundle; the inline `require`s still defer evaluating the
 * dictionaries to first use.
 */
export async function loadZxcvbnModules(): Promise<ZxcvbnModules> {
  return [
    require("@zxcvbn-ts/core"),
    require("@zxcvbn-ts/language-common"),
    require("@zxcvbn-ts/language-en"),
  ] as ZxcvbnModules;
}
