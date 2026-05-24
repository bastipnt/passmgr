// Dev-only timing helper for diagnosing login/unlock latency. Logs are gated on
// NODE_ENV so nothing ships in production builds (Metro and Vite both define
// process.env.NODE_ENV; __DEV__ would throw on the web/Vite side).
const isDev = process.env.NODE_ENV !== "production";

/**
 * Measure an async operation and log its duration in ms (dev only).
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isDev) return fn();

  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.debug(`[perf] ${label}: ${ms}ms`);
  }
}
