export function getMessage(
  type: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: Record<string, string>,
) {
  const reqBody = JSON.stringify(body ?? "");
  const message = `${type}\n${path}\n${timestamp}\n${nonce}\n${reqBody}`;

  return message;
}
