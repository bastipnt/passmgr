import { wipe } from "@repo/crypto";
import type { LoginSessionFn } from "../login";

export type SessionParams = Parameters<LoginSessionFn>;

/**
 * A login's session, held back until the caller knows it may be attached. Call `release`
 * in a `finally`: it wipes the session key unless `attach` handed it over, on every path.
 */
export class HeldSession {
  #params: SessionParams | undefined;
  #attached = false;

  /** Holds `params` from elsewhere (a login that returned them); this handle owns the key now. */
  static of(params: SessionParams): HeldSession {
    const session = new HeldSession();
    session.#params = params;
    return session;
  }

  /** The `LoginSessionFn` to give the login: it holds the session instead of attaching it. */
  readonly hold: LoginSessionFn = async (...params) => {
    this.release();
    this.#params = params;
  };

  get isHeld(): boolean {
    return this.#params !== undefined;
  }

  /**
   * Hands the session to `attach` (`secretsStore.unlockSession`, which wipes the key itself).
   * Counts as attached only once `attach` resolves: one that throws leaves the key to `release`.
   */
  async attach(attach: LoginSessionFn): Promise<void> {
    const params = this.#params;
    if (!params) throw new Error("No session held to attach");
    await attach(...params);
    this.#attached = true;
  }

  /** Wipes the held key unless it was attached; a no-op when nothing is held. */
  release(): void {
    if (this.#params && !this.#attached) wipe(this.#params[1]);
    this.#params = undefined;
    this.#attached = false;
  }
}
