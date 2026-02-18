import type { FallbackProps } from "react-error-boundary";
import PublicLayout from "../layout/PublicLayout";
import { cn } from "@repo/util";
import styles from "./ErrorFallback.module.css";
import { Button } from "@repo/ui/button";

export default function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <PublicLayout>
      <section role="alert" className={cn(styles.section, "space-y-md")}>
        <h1>Oops! Something went wrong</h1>

        {/* <pre>{String(error!.message)}</pre> */}
        <Button onClick={resetErrorBoundary}>Try again</Button>
      </section>
    </PublicLayout>
  );
}
