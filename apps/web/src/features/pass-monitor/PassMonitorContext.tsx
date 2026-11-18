import {
  type BreachCheckState,
  type PassMonitor,
  useBreachCheck,
  usePassMonitor,
} from "@repo/client";
import { createContext, type ReactNode, use, useMemo } from "react";

type Monitor = { monitor: PassMonitor; breach: BreachCheckState };

const MonitorContext = createContext<Monitor | null>(null);

/**
 * One run of the checks for the whole overlay: the findings list and the open page read the
 * same results, and the breach check (network) runs once.
 */
export function PassMonitorProvider({ children }: { children: ReactNode }) {
  const monitor = usePassMonitor();
  const breach = useBreachCheck();
  // Both hooks return a new object each render; their fields are memoized, so key on those.
  const value = useMemo(
    () => ({ monitor, breach }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...Object.values(monitor), ...Object.values(breach)],
  );
  return <MonitorContext value={value}>{children}</MonitorContext>;
}

function useMonitorContext() {
  const context = use(MonitorContext);
  if (!context) throw new Error("Pass Monitor pages need a PassMonitorProvider");
  return context;
}

export const useMonitor = () => useMonitorContext().monitor;
export const useBreach = () => useMonitorContext().breach;
