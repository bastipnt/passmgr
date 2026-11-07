import { Gauge, type Registry } from "@prometheus-io/client";
import { countActiveUsers } from "./util/redis-utils";

const WINDOWS = { "1d": 1, "7d": 7, "30d": 30 } as const;

export function registerActiveUsersGauge(registry: Registry, onError?: (err: unknown) => void) {
  new Gauge({
    name: "passmgr_active_users",
    help: "Approximate distinct users with an authenticated request in the last 1 / 7 / 30 UTC days",
    labelNames: ["window"] as const,
    registers: [registry],
    async collect() {
      try {
        for (const [window, days] of Object.entries(WINDOWS)) {
          this.set({ window }, await countActiveUsers(days));
        }
      } catch (err) {
        // Redis down: leave the series out rather than fail the whole scrape.
        this.reset();
        onError?.(err);
      }
    },
  });
}
