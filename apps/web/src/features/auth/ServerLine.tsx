import { useServerHost } from "@repo/client";
import { ServerIcon } from "lucide-react";

export default function ServerLine() {
  const host = useServerHost();
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <ServerIcon className="size-3.5" aria-hidden />
      Server <span className="font-medium text-foreground">{host}</span>
    </p>
  );
}
