import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./Empty";

export type ErrorStateProps = {
  title: string;
  description: string;
  errorId: string;
  children: ReactNode;
};

export function ErrorState({ title, description, errorId, children }: ErrorStateProps) {
  return (
    <View accessibilityRole="alert" className="flex-1 items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
          <Text className="text-muted-foreground text-xs">Error ID {errorId}</Text>
        </EmptyHeader>
        <EmptyContent>{children}</EmptyContent>
      </Empty>
    </View>
  );
}
