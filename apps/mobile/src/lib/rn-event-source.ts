import RNEventSource, { type EventSourceEvent } from "react-native-sse";

/**
 * `react-native-sse` tracks connection state on an undeclared `status` field
 * using these values (`ERROR` is its own addition, not part of the DOM spec).
 */
const RN_ERROR = -1;
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

type EventSourceInit = {
  headers?: Record<string, string>;
};

type ListenerLike = (event: never) => void;

/**
 * `EventSource` ponyfill for React Native — RN has no `EventSource` global, so
 * tRPC's `httpSubscriptionLink` (which falls back to `globalThis.EventSource`)
 * cannot open a subscription without one.
 *
 * `react-native-sse` covers most of the contract tRPC's SSE consumer needs
 * (custom event types, `data`, `lastEventId`), but differs in three ways this
 * adapter reconciles:
 *
 * 1. It exposes `status`, not `readyState`.
 * 2. On failure it sets `status = ERROR (-1)`, which is not `CLOSED`. tRPC uses
 *    `readyState === CLOSED` to tell a fatal error from a retryable one, so the
 *    error state is mapped to `CLOSED` — otherwise tRPC would sit in "connecting"
 *    forever while nothing reconnects.
 * 3. It reconnects on its own by default. That is disabled here; `StoreProvider`
 *    owns the retry/backoff policy.
 *
 * Note that a *graceful* stream end (HTTP 2xx, request done) dispatches no event
 * at all in `react-native-sse`. Recovery from that relies on the server's SSE
 * pings plus `sse.client.reconnectAfterInactivityMs` (see `apps/server/src/trpc.ts`),
 * which makes tRPC recreate the stream after a period of silence.
 */
export class RNEventSourcePonyfill {
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSED = CLOSED;

  private es: RNEventSource<string>;

  constructor(url: string, init?: EventSourceInit) {
    this.es = new RNEventSource<string>(url, {
      headers: init?.headers,
      // Long-lived stream — no request timeout.
      timeout: 0,
      // Default is a 500ms delay before the first connect.
      timeoutBeforeConnection: 0,
      // Disable the built-in reconnect; StoreProvider retries with backoff.
      pollingInterval: 0,
    });
  }

  get readyState(): number {
    // `status` is set by react-native-sse but missing from its type definitions.
    const status = (this.es as unknown as { status: number }).status;
    return status === RN_ERROR ? CLOSED : status;
  }

  addEventListener(type: string, listener: ListenerLike): void {
    this.es.addEventListener(type, listener as (event: EventSourceEvent<string>) => void);
  }

  removeEventListener(type: string, listener: ListenerLike): void {
    this.es.removeEventListener(type, listener as (event: EventSourceEvent<string>) => void);
  }

  close(): void {
    this.es.close();
  }
}
