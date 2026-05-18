import {
  getMessage,
  SESSION_ID_HEADER,
  SESSION_NONCE_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
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
