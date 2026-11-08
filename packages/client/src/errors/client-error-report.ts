import { CLIENT_ERROR_PLATFORMS, type ClientErrorInput, clientErrorVersion } from "@repo/schema";
import { useContext, useEffect } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useTRPCClient } from "../util/trpc";

export type { ClientErrorInput } from "@repo/schema";

type Sender = (report: ClientErrorInput) => Promise<unknown>;

export type ClientErrorEnvironment = {
  platform: (typeof CLIENT_ERROR_PLATFORMS)[number];
  appVersion: string;
};

type ClientErrorOccurrence = Pick<ClientErrorInput, "kind" | "area">;

/** A crash loop must not turn into a request storm. */
const MAX_REPORTS_PER_RUN = 5;

let sender: Sender | null = null;
let sent = 0;

export function setClientErrorSender(next: Sender | null) {
  sender = next;
}

const reported = new WeakSet<object>();

/**
 * Counts a crash on the server (kind, area, platform, release: no message, no stack, no ID).
 * Does nothing unless an account session is attached, so a local vault never talks to the server.
 */
export function reportClientError(
  err: unknown,
  { kind, area }: ClientErrorOccurrence,
  { platform, appVersion }: ClientErrorEnvironment,
) {
  if (!sender || sent >= MAX_REPORTS_PER_RUN) return;
  if (typeof err === "object" && err !== null) {
    if (reported.has(err)) return;
    reported.add(err);
  }
  sent++;
  sender({ kind, area, platform, version: clientErrorVersion(appVersion) }).catch(() => {});
}

/** Mount once inside the providers: it makes `reportClientError` live while an account session is attached. */
export function useClientErrorReporting() {
  const trpcClient = useTRPCClient();
  const { mode } = useContext(SessionContext);
  const attached = mode === "online";

  useEffect(() => {
    if (!attached) return;
    setClientErrorSender((report) => trpcClient.clientError.report.mutate(report));
    return () => setClientErrorSender(null);
  }, [attached, trpcClient]);
}
