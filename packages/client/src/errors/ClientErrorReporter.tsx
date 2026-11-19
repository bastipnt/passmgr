import { useClientErrorReporting } from "./client-error-report";

export function ClientErrorReporter() {
  useClientErrorReporting();
  return null;
}
