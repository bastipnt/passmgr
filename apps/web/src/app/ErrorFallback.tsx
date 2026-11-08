import { Button } from "@repo/ui/components/Button";
import { ErrorState } from "@repo/ui/components/ErrorState";
import type { FallbackProps } from "react-error-boundary";
import { copyErrorDetails, describeWebError } from "@/lib/error-report";

/** The last resort, outside the router and every provider: it can only reload. */
export default function ErrorFallback({ error }: FallbackProps) {
  const { id, message, details } = describeWebError(error);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <ErrorState
        title="Something went wrong"
        description={message}
        errorId={id}
        className="max-w-lg"
      >
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="outline" onClick={() => void copyErrorDetails(details)}>
          Copy error details
        </Button>
      </ErrorState>
    </main>
  );
}
