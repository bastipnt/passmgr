export const authPaths = {
  login: "/login",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
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
