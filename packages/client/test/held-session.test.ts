import { describe, expect, it, vi } from "vitest";
import { HeldSession } from "../src/account/held-session";

const key = () => new Uint8Array(32).fill(7);
const salt = () => new Uint8Array<ArrayBuffer>(new ArrayBuffer(32)).fill(3);
const isZero = (bytes: Uint8Array) => bytes.every((b) => b === 0);

describe("HeldSession", () => {
  it("wipes the held key on release when it was never attached", async () => {
    const session = new HeldSession();
    const sessionKey = key();
    await session.hold("s-1", sessionKey, salt());

    expect(session.isHeld).toBe(true);
    session.release();

    expect(isZero(sessionKey)).toBe(true);
    expect(session.isHeld).toBe(false);
  });

  it("keeps the key on release once attached: the attach took it over", async () => {
    const session = new HeldSession();
    const sessionKey = key();
    const authSalt = salt();
    await session.hold("s-1", sessionKey, authSalt);
    const attach = vi.fn(async () => {});

    await session.attach(attach);
    session.release();

    expect(attach).toHaveBeenCalledWith("s-1", sessionKey, authSalt);
    expect(isZero(sessionKey)).toBe(false);
  });

  it("wipes the key on release when the attach throws", async () => {
    const session = new HeldSession();
    const sessionKey = key();
    await session.hold("s-1", sessionKey, salt());

    await expect(
      session.attach(async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    session.release();

    expect(isZero(sessionKey)).toBe(true);
  });

  it("wipes the key a second hold replaces", async () => {
    const session = new HeldSession();
    const first = key();
    const second = key();
    await session.hold("s-1", first, salt());
    await session.hold("s-2", second, salt());

    expect(isZero(first)).toBe(true);
    session.release();
    expect(isZero(second)).toBe(true);
  });

  it("refuses to attach with nothing held", async () => {
    const attach = vi.fn(async () => {});
    await expect(new HeldSession().attach(attach)).rejects.toThrow();
    expect(attach).not.toHaveBeenCalled();
  });

  it("takes over params held elsewhere (of)", () => {
    const sessionKey = key();
    const session = HeldSession.of(["s-1", sessionKey, salt()]);
    expect(session.isHeld).toBe(true);
    session.release();
    expect(isZero(sessionKey)).toBe(true);
  });
});
