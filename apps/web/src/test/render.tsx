// Deep import on purpose: several suites replace the whole "@repo/client"
// barrel with vi.mock, which would blank out the provider.
import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, type RenderResult, render } from "@testing-library/react";
import { type ReactElement, type ReactNode, useState } from "react";

import { usePreferencesStore } from "@/hooks/use-preferences-store";

/**
 * Preferences are read deep in the tree (copy behaviour, reveal timeouts), so
 * every rendered component needs the provider even when the test itself does
 * not care about a preference. A fresh query client too: `StoreProvider` locks
 * through `useLock`, which clears it.
 */
function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider store={usePreferencesStore()}>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react";
