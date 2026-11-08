import { createErrorReport, type ErrorEnvironment, type ErrorReport } from "./error-report";
import { userMessage } from "./user-message";

export type ErrorDescription = ErrorReport & {
  /** Safe to show: chosen by the kind of error, never its own text. */
  message: string;
};

/** What the UI shows for a caught error: the message, the error ID and the details to copy. */
export function describeError(err: unknown, env: ErrorEnvironment): ErrorDescription {
  return { ...createErrorReport(err, env), message: userMessage(err) };
}
