const isDev = process.env.NODE_ENV !== "production";

function safeDetail(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/**
 * `console.*` for failures. Production builds log the context and the error's
 * name only: messages can hold input values, which means decrypted secrets.
 */
export function logError(context: string, ...err: [] | [unknown]) {
  if (err.length === 0) console.error(context);
  else console.error(context, isDev ? err[0] : safeDetail(err[0]));
}

export function logWarning(context: string, ...err: [] | [unknown]) {
  if (err.length === 0) console.warn(context);
  else console.warn(context, isDev ? err[0] : safeDetail(err[0]));
}
