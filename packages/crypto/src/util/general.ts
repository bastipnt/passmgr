export function getMessage(
  type: string,
  path: string,
  timestamp: string,
  body: Record<string, string>,
) {
  const reqBody = JSON.stringify(body ?? "");
  const message = `${type}\n${path}\n${timestamp}\n${reqBody}`;
  console.log(message);

  return message;
}
