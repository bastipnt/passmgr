import type { SessionInfo } from "@repo/schema";
import { formatTimeAgo } from "../sync-summary";

/** How a signed-in device is named in the session list. */
export function sessionLabel(session: Pick<SessionInfo, "deviceName">): string {
  return session.deviceName ?? "Unknown device";
}

/** "Active 2 hours ago · signed in 3 days ago" ("Active now" for this device). */
export function sessionDetail(session: SessionInfo, now = Date.now()): string {
  const active = session.current
    ? "Active now"
    : `Active ${formatTimeAgo(session.lastSeenAt, now)}`;
  return `${active} · signed in ${formatTimeAgo(session.createdAt, now)}`;
}
