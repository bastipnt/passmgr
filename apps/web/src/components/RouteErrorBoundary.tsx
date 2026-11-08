import type { ClientErrorInput } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { ErrorState } from "@repo/ui/components/ErrorState";
import type { ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { copyErrorDetails, describeWebError, reportWebError } from "@/lib/error-report";

function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { id, message, details } = describeWebError(error);
  const [, navigate] = useLocation();

  return (
    <ErrorState
      title="This page ran into a problem"
      description={message}
      errorId={id}
      className="min-h-64"
    >
      <Button
        onClick={() => {
          navigate(recordPaths.index);
          resetErrorBoundary();
        }}
      >
        Back to vault
      </Button>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
      <Button variant="ghost" onClick={() => void copyErrorDetails(details)}>
        Copy error details
      </Button>
    </ErrorState>
  );
}

/**
 * A crash in one view shows the fallback in its place and leaves the rest of
 * the app running. Navigating elsewhere clears it.
 */
export function RouteErrorBoundary({
  area,
  children,
}: {
  area: ClientErrorInput["area"];
  children: ReactNode;
}) {
  const [location] = useLocation();
  return (
    <ErrorBoundary
      FallbackComponent={RouteErrorFallback}
      resetKeys={[location]}
      onError={(error) => reportWebError(error, "render", area)}
    >
      {children}
    </ErrorBoundary>
  );
}
