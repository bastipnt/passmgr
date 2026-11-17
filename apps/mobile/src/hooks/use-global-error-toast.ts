import { logError } from "@repo/client";
import { toast } from "@repo/ui-native";
import { useEffect } from "react";
import { nativeClipboard } from "@/lib/clipboard";
import { describeNativeError, reportNativeError } from "@/lib/error-report";

/**
 * Errors nothing caught show a toast instead of failing silently. In development the
 * previous handler still runs, so the red box keeps showing.
 */
export function useGlobalErrorToast() {
  useEffect(() => {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (__DEV__) previous(error, isFatal);
      reportNativeError(error, "uncaught", "app");
      const { id, message, details } = describeNativeError(error);
      logError(`Unhandled error ${id}`, error);
      toast.error(message, {
        description: `Error ID ${id}`,
        durationMs: 10_000,
        action: {
          label: "Copy error details",
          onPress: () =>
            void nativeClipboard
              .write(details)
              .catch(() => toast.error("Couldn't copy the error details")),
        },
      });
    });
    return () => ErrorUtils.setGlobalHandler(previous);
  }, []);
}
