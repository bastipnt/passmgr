import RNEventSource, { type EventSourceEvent } from "react-native-sse";

// react-native-sse's undeclared `status` values; ERROR (-1) is its own, not in the DOM spec.
const RN_ERROR = -1;
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

type EventSourceInit = {
  headers?: Record<string, string>;
};

type ListenerLike = (event: never) => void;

/** `EventSource` for tRPC's SSE link (RN has none): "Record stream (SSE)", apps/mobile/CLAUDE.md */
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
    // ERROR maps to CLOSED: tRPC reads CLOSED as fatal, anything else as "still connecting", and
    // nothing would reconnect.
    const status = this.es.status;
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
