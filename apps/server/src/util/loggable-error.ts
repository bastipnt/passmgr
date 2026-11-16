import { DrizzleQueryError } from "drizzle-orm";

const MAX_DEPTH = 5;
const MAX_AGGREGATED = 5;

const WITHHELD_MESSAGE = "[withheld: database error]";

export type LoggableError = {
  type: string;
  message: string;
  code?: string | number;
  stack: string;
  cause?: LoggableError;
  errors?: LoggableError[];
};

function errorCode(error: object): string | number | undefined {
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

function isDriverError(error: object): boolean {
  return error instanceof DrizzleQueryError || ("severity" in error && "code" in error);
}

/** Whether a database error is in the error's cause chain (tRPC wraps a thrown one in a TRPCError). */
export function hasDatabaseError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth >= MAX_DEPTH) return false;
  if (isDriverError(error)) return true;
  const inner = error instanceof AggregateError ? error.errors.slice(0, MAX_AGGREGATED) : [];
  return [...("cause" in error ? [error.cause] : []), ...inner].some((e) =>
    hasDatabaseError(e, depth + 1),
  );
}

function errorType(error: object): string {
  if (error instanceof DrizzleQueryError) return "DrizzleQueryError";
  if (error instanceof Error && error.name !== "Error") return error.name;
  return error.constructor?.name ?? "Object";
}

/** The stack below its header, which repeats the message line by line. */
function stackFrames(error: Error): string {
  const headerLines = Math.max(1, error.message.split("\n").length);
  const frames = error.stack
    ?.split("\n")
    .slice(headerLines)
    .filter((line) => /^\s+at /.test(line))
    .join("\n");
  return frames ?? "";
}

function toLoggable(
  error: unknown,
  withMessage: boolean,
  depth: number,
): LoggableError | undefined {
  if (!error || typeof error !== "object" || depth >= MAX_DEPTH) return undefined;
  const errors =
    error instanceof AggregateError
      ? error.errors
          .slice(0, MAX_AGGREGATED)
          .map((e) => toLoggable(e, withMessage, depth + 1))
          .filter((e) => e !== undefined)
      : undefined;
  return {
    type: errorType(error),
    message: !withMessage ? WITHHELD_MESSAGE : error instanceof Error ? error.message : "",
    code: errorCode(error),
    stack: error instanceof Error ? stackFrames(error) : "",
    cause: toLoggable("cause" in error ? error.cause : undefined, withMessage, depth + 1),
    errors: errors?.length ? errors : undefined,
  };
}

/**
 * An error as it goes to the log: no enumerable fields (a Drizzle query error's
 * `query` / `params`, a Postgres error's `detail`), and no message at all once a
 * database error is in the chain: theirs hold the SQL, its params and the
 * offending values, and every error wrapping one repeats its message.
 */
export function loggableError(error: unknown): LoggableError {
  return (
    toLoggable(error, !hasDatabaseError(error), 0) ?? {
      type: typeof error,
      message: String(error),
      stack: "",
    }
  );
}
