import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import { SortedRecordsProvider } from "@repo/client/src/providers/SortedRecordsProvider";
import type { ReactNode } from "react";
import { usePreferencesStore } from "@/hooks/use-preferences-store";

/** The real `SortedRecordsProvider`, under the preferences its sort and filters are kept in. */
export function SortedRecordsWrapper({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}
