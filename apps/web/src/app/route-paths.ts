export const authPaths = {
  /** First visit, no vault on the device: how to start (ADR 0001 D2). Else → login. */
  welcome: "/welcome",
  login: "/login",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
  /** A vault on this device only, no account (ADR 0001 D2). */
  createLocal: "/local-vault",
  /** A backup restored into a new local vault (ADR 0001 D12). */
  restore: "/restore",
  recover: "/recover",
  /** Recovery of the active local vault, on the device (ADR 0001 D10). */
  recoverLocal: "/recover?vault=local",
} as const;

export const recordPaths = {
  index: "/",

  detail: "/record/:recordId",
  /** Loose: matches a record and any of its sub-routes. For "which record is in view?" */
  detailAny: "/record/:recordId/*?",

  edit: "/record/:recordId/edit",

  /** One pattern for both: no `:version` → the list, `:version` → that revision */
  versions: "/record/:recordId/versions/:version?",

  // ── builders ──
  record: (recordId: string) => `/record/${recordId}`,
  editRecord: (recordId: string) => `/record/${recordId}/edit`,
  recordVersions: (recordId: string) => `/record/${recordId}/versions`,
  version: (recordId: string, version: number) => `/record/${recordId}/versions/${version}`,

  /**
   * Create is a mode layered over whatever is in view, not a resource of its
   * own — so it lives in the query, and the path keeps saying which record is
   * behind it. Value is the optional prefilled title.
   */
  createParam: "new",
} as const;

export const settingsPaths = {
  index: "/settings",
  account: "/settings/account",
  general: "/settings/general",
  generator: "/settings/generator",
  security: "/settings/security",
  passMonitor: "/settings/pass-monitor",
  reusedPasswords: "/settings/reused-passwords",
  duplicates: "/settings/pass-monitor/duplicates",
  weakPasswords: "/settings/pass-monitor/weak-passwords",

  /** Prefix the app-level router hands to the settings feature. */
  any: "/settings/*?",
} as const;

/**
 * Phone page stack for `PageTransitions`: moving to a deeper page slides it in
 * from the right, moving up slides back. First match wins, so list sub-pages
 * before their parent's wildcard. Unlisted paths (auth) don't animate.
 */
export const pageDepths = [
  [recordPaths.index, 0],
  // Edit and versions are sheets over the record, not pages: same depth.
  [recordPaths.detailAny, 1],
  [settingsPaths.index, 1],
  [settingsPaths.duplicates, 3],
  [settingsPaths.weakPasswords, 3],
  [settingsPaths.any, 2],
] as const;
