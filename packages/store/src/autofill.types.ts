/** One login the OS autofill can offer: what the iOS extension / Android service read back. */
export type AutofillEntry = {
  recordId: string;
  title: string;
  username: string;
  password: string;
  /** `websiteHost`s: a request matches a host or a subdomain of it. */
  hosts: string[];
};

/** `enabled`: the OS uses this app for autofill; `unavailable`: no native support (web, old OS). */
export type AutofillState = "enabled" | "disabled" | "unavailable";
