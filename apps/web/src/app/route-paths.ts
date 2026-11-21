export const recoverActiveSearch = "vault=active";

export const authPaths = {
  /** First visit, no vault on the device: how to start (ADR 0001 D2). Else → unlock. */
  welcome: "/welcome",
  /** The last used vault's unlock. */
  unlock: "/login",
  /** Email + password of an account: unlocks its vault on the device, or brings it here. */
  accountLogin: "/login/account",
  enrollBiometric: "/enroll-biometric",
  /** A new vault, on this device first; an account to sync it is optional (ADR 0001 D2, D9). */
  create: "/create",
  /** A backup or another app's export into a new local vault (ADR 0001 D12). */
  restore: "/restore",
  /** Recovery of an account by its email, from the account login. */
  recover: "/recover",
  /**
   * Recovery of the vault on the unlock card: an account's with its email, a
   * local vault's on the device (ADR 0001 D10).
   */
  recoverActive: `/recover?${recoverActiveSearch}`,
} as const;

const shortcutsParam = "shortcuts";
const generateParam = "generate";

export const recordPaths = {
  index: "/",

  detail: "/record/:recordId",
  /** Loose: matches a record and any of its sub-routes. For "which record is in view?" */
  detailAny: "/record/:recordId/*?",

  edit: "/record/:recordId/edit",

  /** One pattern for both: no `:version` → the list, `:version` → that revision */
  versions: "/record/:recordId/versions/:version?",

  record: (recordId: string) => `/record/${recordId}`,
  editRecord: (recordId: string) => `/record/${recordId}/edit`,
  recordVersions: (recordId: string) => `/record/${recordId}/versions`,
  /** The edit with the password generator open (Pass Monitor's "Change"). */
  changePassword: (recordId: string) => `/record/${recordId}/edit?${generateParam}`,
  version: (recordId: string, version: number) => `/record/${recordId}/versions/${version}`,

  /**
   * Create is a mode layered over whatever is in view, not a resource of its
   * own — so it lives in the query, and the path keeps saying which record is
   * behind it. Value is the optional prefilled title.
   */
  createParam: "new",
  /** With `createParam`: the record type to create. Absent (and no duplicate) → the type picker. */
  createTypeParam: "type",
  /** With `createParam`: the record to copy; its type replaces `createTypeParam`. */
  createDuplicateParam: "duplicate",
  /** On the edit route: opens the password generator once. */
  generateParam,
  /** Presence opens the keyboard shortcuts list over the vault. */
  shortcutsParam: shortcutsParam,
  shortcuts: `/?${shortcutsParam}`,
} as const;

/** The settings overlay; on a phone `index` is the list of sections. */
export const settingsPaths = {
  index: "/settings",
  account: "/settings/account",
  devices: "/settings/devices",
  sync: "/settings/sync",
  /** Create, rename and delete vaults (ADR 0001 D6). */
  vaults: "/settings/vaults",
  tags: "/settings/tags",
  trash: "/settings/trash",
  backup: "/settings/backup",
  security: "/settings/security",
  appearance: "/settings/appearance",
  generator: "/settings/generator",
  /** Desktop only. */
  shortcuts: "/settings/shortcuts",

  /** Prefix the app-level router hands to the settings feature. */
  any: "/settings/*?",
} as const;

/** Pass Monitor findings: a screen of its own next to the vault. */
export const passMonitorPaths = {
  index: "/pass-monitor",
  weak: "/pass-monitor/weak",
  reused: "/pass-monitor/reused",
  duplicates: "/pass-monitor/duplicates",
  old: "/pass-monitor/old",
  breached: "/pass-monitor/breached",
  insecure: "/pass-monitor/insecure",
  twoFactor: "/pass-monitor/two-factor",
  /** One of the finding pages, below the overview. */
  page: "/pass-monitor/*",
  any: "/pass-monitor/*?",
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
  [settingsPaths.any, 2],
  [passMonitorPaths.page, 2],
  [passMonitorPaths.any, 1],
] as const;
