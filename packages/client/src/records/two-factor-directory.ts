/** Sites that support TOTP (2fa.directory): domain → setup documentation, `""` when none. */
export type TwoFactorDirectory = ReadonlyMap<string, string>;
export type TwoFactorSite = { domain: string; documentation?: string };

let loading: Promise<TwoFactorDirectory> | undefined;
let loaded: TwoFactorDirectory | undefined;

/** The directory if it has loaded already, so a later mount can render it right away. */
export const loadedTwoFactorDirectory = () => loaded;

/** The bundled snapshot (`scripts/update-two-factor-directory.ts`), loaded on first use. */
export function loadTwoFactorDirectory(): Promise<TwoFactorDirectory> {
  loading ??= import("./two-factor-directory.json")
    .then(({ default: { sites } }) => (loaded = new Map(Object.entries(sites))))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/** The directory entry of a host or the closest domain above it (`login.example.com` → `example.com`). */
export function twoFactorSiteOf(
  host: string,
  directory: TwoFactorDirectory,
): TwoFactorSite | undefined {
  const labels = host.toLowerCase().split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const domain = labels.slice(i).join(".");
    const documentation = directory.get(domain);
    if (documentation !== undefined) return { domain, documentation: documentation || undefined };
  }
  return undefined;
}
