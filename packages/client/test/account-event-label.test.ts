import type { AccountEvent } from "@repo/schema";
import { describe, expect, it } from "vitest";
import {
  accountEventDetail,
  accountEventTitle,
  isNotableAccountEvent,
} from "../src/util/account-event-label";

const now = Date.UTC(2026, 10, 12, 12);
const event = (over: Partial<AccountEvent>): AccountEvent => ({
  id: 1,
  type: "login",
  deviceName: "Firefox on Linux",
  newDevice: false,
  createdAt: now - 2 * 60 * 60 * 1000,
  ...over,
});

describe("account event labels", () => {
  it("names the event and marks a new device", () => {
    expect(accountEventTitle(event({}))).toBe("Signed in");
    expect(accountEventTitle(event({ newDevice: true }))).toBe("Signed in on a new device");
  });

  it("shows the device and how long ago", () => {
    expect(accountEventDetail(event({}), now)).toBe("Firefox on Linux · 2 hours ago");
    expect(accountEventDetail(event({ deviceName: null }), now)).toBe(
      "Unknown device · 2 hours ago",
    );
  });

  it("flags failed sign-ins and new devices only", () => {
    expect(isNotableAccountEvent(event({}))).toBe(false);
    expect(isNotableAccountEvent(event({ newDevice: true }))).toBe(true);
    expect(isNotableAccountEvent(event({ type: "login_failed" }))).toBe(true);
    expect(isNotableAccountEvent(event({ type: "second_factor_failed" }))).toBe(true);
    expect(isNotableAccountEvent(event({ type: "password_changed" }))).toBe(false);
  });
});
