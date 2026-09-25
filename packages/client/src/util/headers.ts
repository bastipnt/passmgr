import {
  getMessage,
  SESSION_ID_HEADER,
  SESSION_NONCE_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
  SUBSCRIPTION_SIGNATURE_PATH,
} from "@repo/crypto";
import { secretsStore } from "@repo/store";
import { toBase64 } from "@repo/util";

type Operation<TInput = unknown> = {
  id: number;
  type: "mutation" | "query" | "subscription";
  input: TInput;
  path: string;
};

type HTTPHeaders = Record<string, string | string[] | undefined>;

export async function generateAuthHeaders(currentOperation: Operation): Promise<HTTPHeaders> {
  const sessionHeaders: HTTPHeaders = {};

  if (secretsStore.sessionId) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    sessionHeaders[SESSION_ID_HEADER] = secretsStore.sessionId;
    sessionHeaders[SESSION_TIMESTAMP_HEADER] = timestamp;
    sessionHeaders[SESSION_NONCE_HEADER] = nonce;

    const { type, input, path } = currentOperation;
    const message = getMessage(type, path, timestamp, nonce, input as Record<string, string>);

    const signature = toBase64(await secretsStore.signRequest(message));
    sessionHeaders[SESSION_SIGNATURE_HEADER] = signature;
  }

  return sessionHeaders;
}

type SubscriptionParams = {
  sessionId: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

/**
 * Signed auth values for SSE subscriptions, sent as tRPC `connectionParams`
 * (EventSource can't set headers). tRPC re-resolves them on every
 * (re)connect, so each connection gets a fresh timestamp + nonce.
 */
export async function generateSubscriptionParams(): Promise<SubscriptionParams | null> {
  const { sessionId } = secretsStore;
  if (!sessionId) return null;

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const message = getMessage("subscription", SUBSCRIPTION_SIGNATURE_PATH, timestamp, nonce, {});
  try {
    const signature = toBase64(await secretsStore.signRequest(message));
    return { sessionId, timestamp, nonce, signature };
  } catch {
    // No authKey (offline / locked session) — server rejects, polling covers it.
    return null;
  }
}
