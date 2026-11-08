import { useClientErrorReporting } from "./client-error-report";

/** Render once inside the providers (a session and the server client are needed). */
export function ClientErrorReporter() {
  useClientErrorReporting();
  return null;
}
