import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./Empty";

type ErrorStateProps = {
  title: string;
  description: string;
  errorId: string;
  children: ReactNode;
  className?: string;
};

export function ErrorState({ title, description, errorId, children, className }: ErrorStateProps) {
  return (
    <Empty role="alert" className={className}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <p className="text-muted-foreground text-xs">
          Error ID <code className="font-mono">{errorId}</code>
        </p>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">{children}</EmptyContent>
    </Empty>
  );
}
