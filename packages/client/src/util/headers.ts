import {
  getMessage,
  SESSION_ID_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
} from "@repo/crypto";
import { secretsStore } from "../secrets-store";
import { toBase64 } from "@repo/crypto/src/util/format";

type Operation<TInput = unknown> = {
  id: number;
  type: "mutation" | "query" | "subscription";
  input: TInput;
  path: string;
};

export async function generateAuthHeaders(currentOperation: Operation): Promise<Headers> {
  const sessionHeaders = new Headers();

  if (secretsStore.sessionId) {
    const timestamp = Date.now().toString();
    sessionHeaders.set(SESSION_ID_HEADER, secretsStore.sessionId);
    sessionHeaders.set(SESSION_TIMESTAMP_HEADER, timestamp);

    const { type, input, path } = currentOperation;
    const message = getMessage(type, path, timestamp, input as Record<string, string>);

    const signature = toBase64(await secretsStore.signRequest(message));
    sessionHeaders.set(SESSION_SIGNATURE_HEADER, signature);
  }

  return sessionHeaders;
}
