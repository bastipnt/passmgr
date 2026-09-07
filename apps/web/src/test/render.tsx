// Deep import on purpose: several suites replace the whole "@repo/client"
// barrel with vi.mock, which would blank out the provider.
import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import { type RenderOptions, type RenderResult, render } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";

import { usePreferencesStore } from "@/hooks/use-preferences-store";

/**
 * Preferences are read deep in the tree (copy behaviour, reveal timeouts), so
 * every rendered component needs the provider even when the test itself does
 * not care about a preference.
 */
function Providers({ children }: { children: ReactNode }) {
  return <PreferencesProvider store={usePreferencesStore()}>{children}</PreferencesProvider>;
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react";
