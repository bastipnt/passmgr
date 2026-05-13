import type { FallbackProps } from "react-error-boundary";
import { isDefined } from "@repo/util";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";

export default function ErrorFallback({ resetErrorBoundary, error }: FallbackProps) {
  const errorMessage =
    isDefined(error) && "message" in (error as { message?: string })
      ? (error as { message: string }).message
      : "";
  return (
    <main className="flex flex-col justify-center items-center min-h-screen">
      <section role="alert" className="w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Oops! Something went wrong</CardTitle>
          </CardHeader>
          <CardContent>{errorMessage}</CardContent>
          <CardFooter>
            <CardAction>
              <Button onClick={resetErrorBoundary}>Try again</Button>
            </CardAction>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
