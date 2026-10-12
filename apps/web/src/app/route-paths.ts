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
  /** With `createParam`: the record type to create. Absent → the type picker. */
  createTypeParam: "type",
} as const;

export const settingsPaths = {
  index: "/settings",
  account: "/settings/account",
  /** Create, rename and delete vaults (ADR 0001 D6). */
  vaults: "/settings/vaults",
  general: "/settings/general",
  generator: "/settings/generator",
  security: "/settings/security",
  /** Deleted records: restore or delete for good. */
  trash: "/settings/trash",

  /** Prefix the app-level router hands to the settings feature. */
  any: "/settings/*?",
} as const;

/** Weak, reused, duplicate and old passwords; rendered in the settings layout. */
export const passMonitorPaths = {
  index: "/settings/pass-monitor",
  weak: "/settings/pass-monitor/weak",
  reused: "/settings/pass-monitor/reused",
  duplicates: "/settings/pass-monitor/duplicates",
  old: "/settings/pass-monitor/old",
  breached: "/settings/pass-monitor/breached",
  /** One of the finding pages, below the overview. */
  page: "/settings/pass-monitor/*",
  any: "/settings/pass-monitor/*?",
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
  [passMonitorPaths.page, 3],
  [settingsPaths.any, 2],
] as const;
