import type { AccountEvent, AccountEventType } from "@repo/schema";
import { formatTimeAgo } from "../sync-summary";

const TITLES: Record<AccountEventType, string> = {
  account_created: "Account created",
  login: "Signed in",
  device_login: "Signed in with biometrics",
  login_failed: "Sign-in failed: wrong password",
  second_factor_failed: "Sign-in failed: wrong two-factor code",
  password_changed: "Password changed",
  password_keys_updated: "Password key settings updated",
  account_recovered: "Password reset with the recovery key",
  email_verified: "Email address verified",
  two_factor_enabled: "Two-factor authentication turned on",
  two_factor_disabled: "Two-factor authentication turned off",
  backup_codes_regenerated: "New backup codes created",
  device_credential_added: "Biometric unlock set up",
  device_credential_removed: "Biometric unlock removed",
  session_revoked: "Device signed out",
  other_sessions_revoked: "All other devices signed out",
};

export function accountEventTitle(event: Pick<AccountEvent, "type" | "newDevice">): string {
  const title = TITLES[event.type];
  return event.newDevice ? `${title} on a new device` : title;
}

/** "Firefox on Linux · 2 hours ago". For `session_revoked` the device is the one signed out. */
export function accountEventDetail(event: AccountEvent, now = Date.now()): string {
  return `${event.deviceName ?? "Unknown device"} · ${formatTimeAgo(event.createdAt, now)}`;
}

/**
 * Worth a second look: a failed sign-in (a wrong second-factor code means the
 * password was right) or a sign-in from a device the log hasn't seen.
 */
export function isNotableAccountEvent(event: Pick<AccountEvent, "type" | "newDevice">): boolean {
  return event.newDevice || event.type === "login_failed" || event.type === "second_factor_failed";
}
