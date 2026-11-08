import { Button, ErrorState, Screen } from "@repo/ui-native";
import * as Clipboard from "expo-clipboard";
import { type ErrorBoundaryProps, router } from "expo-router";
import { useState } from "react";
import { describeNativeError } from "@/lib/error-report";
import { recordPaths } from "@/route-paths";

/**
 * A crash in one screen shows this in its place; the other tabs keep working.
 * Exported as `ErrorBoundary` by route files, so it can't rely on providers
 * (the root layout's version sits above them): no toast, the button says "Copied".
 */
export function RouteErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const { id, message, details } = describeNativeError(error);
  const [copied, setCopied] = useState(false);

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
