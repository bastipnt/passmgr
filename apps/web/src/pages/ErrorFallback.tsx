import type { FallbackProps } from "react-error-boundary";
import PublicLayout from "../layout/PublicLayout";
import { cn, isDefined } from "@repo/util";
import styles from "./ErrorFallback.module.css";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";

interface ErrorFallbackProps extends FallbackProps {
  error: { message?: string } | undefined;
}

export default function ErrorFallback({ resetErrorBoundary, error }: ErrorFallbackProps) {
  const errorMessage = isDefined(error) && "message" in error ? error.message : "";
  return (
    <PublicLayout>
      <section role="alert" className={cn(styles.section, "space-y-md")}>
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
    </PublicLayout>
  );
}
