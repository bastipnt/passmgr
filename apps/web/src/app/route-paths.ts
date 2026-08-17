export const authPaths = {
  login: "/login",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
} as const;

export const recordPaths = {
  index: "/",
  /** wouter pattern — use with `<Route path>` / `useRoute` */
  detail: "/record/:recordId",
  record: (recordId: string) => `/record/${recordId}`,
} as const;
