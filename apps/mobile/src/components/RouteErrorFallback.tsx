import type { ClientErrorInput } from "@repo/client";
import { Button, ErrorState, Screen } from "@repo/ui-native";
import * as Clipboard from "expo-clipboard";
import { type ErrorBoundaryProps, router } from "expo-router";
import { useEffect, useState } from "react";
import { describeNativeError, reportNativeError } from "@/lib/error-report";
import { recordPaths } from "@/route-paths";

/**
 * A crash in one screen shows this in its place; the other tabs keep working.
 * Exported as `ErrorBoundary` by route files, so it can't rely on providers
 * (the root layout's version sits above them): no toast, the button says "Copied".
 */
function RouteErrorFallback({
  area,
  error,
  retry,
}: ErrorBoundaryProps & { area: ClientErrorInput["area"] }) {
  const { id, message, details } = describeNativeError(error);
  const [copied, setCopied] = useState(false);

  useEffect(() => reportNativeError(error, "render", area), [error, area]);

  return (
    <Screen>
      <ErrorState title="Something went wrong" description={message} errorId={id}>
        <Button size="lg" className="w-full" onPress={() => void retry()}>
          Reload
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onPress={() => {
            void retry();
            router.replace(recordPaths.index);
          }}
        >
          Back to vault
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onPress={() => void Clipboard.setStringAsync(details).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy error details"}
        </Button>
      </ErrorState>
    </Screen>
  );
}

/** An expo-router `ErrorBoundary` export for screens and layouts of `area`. */
export function routeErrorFallback(area: ClientErrorInput["area"]) {
  return (props: ErrorBoundaryProps) => <RouteErrorFallback area={area} {...props} />;
}
