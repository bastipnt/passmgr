import { logError } from "@repo/client";
import { toast } from "@repo/ui";
import { useEffect } from "react";
import { copyErrorDetails, describeWebError, reportWebError } from "@/lib/error-report";

/** Browsers raise this for a harmless layout loop; it isn't a failure to report. */
const IGNORED_MESSAGES = ["ResizeObserver loop"];

function showErrorToast(error: unknown, kind: "rejection" | "uncaught") {
  reportWebError(error, kind, "app");
  const { id, message, details } = describeWebError(error);
  logError(`Unhandled error ${id}`, error);
  toast.error(message, {
    id,
    description: `Error ID ${id}`,
    action: { label: "Copy error details", onClick: () => void copyErrorDetails(details) },
  });
}

/** Errors nothing caught show a toast instead of failing silently. */
export function useGlobalErrorToast() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => showErrorToast(event.reason, "rejection");
    const onError = (event: ErrorEvent) => {
      if (IGNORED_MESSAGES.some((ignored) => event.message.includes(ignored))) return;
      showErrorToast(event.error ?? event.message, "uncaught");
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
}
