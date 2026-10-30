import { useServerHost } from "@repo/client";
import { ServerIcon } from "lucide-react";

/** The release tag the build was made from; local builds have none. */
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";

export default function ServerLine() {
  const host = useServerHost();
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <ServerIcon className="size-3.5" aria-hidden />
      Server <span className="font-medium text-foreground">{host}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{APP_VERSION}</span>
    </p>
  );
}
