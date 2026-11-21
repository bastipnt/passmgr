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
  const value = useMemo(() => ({ monitor, breach }), [monitor, breach]);
  return <MonitorContext value={value}>{children}</MonitorContext>;
}

function useMonitorContext() {
  const context = use(MonitorContext);
  if (!context) throw new Error("Pass Monitor pages need a PassMonitorProvider");
  return context;
}

export const useMonitor = () => useMonitorContext().monitor;
export const useBreach = () => useMonitorContext().breach;
