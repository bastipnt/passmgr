/** One login the OS autofill can offer: what the iOS extension / Android service read back. */
export type AutofillEntry = {
  recordId: string;
  title: string;
  username: string;
  password: string;
  /** `websiteHost`s: a request matches a host or a subdomain of it. */
  hosts: string[];
};

/**
 * A login created in the OS autofill ("Create login"), handed to the app to save on its next
 * unlock: the extension / service can't write the vault, the keys live in the app's JS session.
 */
export type PendingAutofillLogin = {
  /** A UUID, kept as the new record's id: a repeated import finds it and skips it. */
  id: string;
  title: string;
  website: string;
  username: string;
  password: string;
  /** ISO, when it was created and filled in. */
  createdAt: string;
};

/** `enabled`: the OS uses this app for autofill; `unavailable`: no native support (web, old OS). */
export type AutofillState = "enabled" | "disabled" | "unavailable";
