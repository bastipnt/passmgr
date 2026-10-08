import { useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/Item";
import { DownloadIcon, FileDownIcon } from "lucide-react";
import ExportDialog from "./ExportDialog";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Export / backup (ADR 0001 D12), with when this vault was last backed up. */
export default function ExportSettings() {
  const { active } = useStore();
  if (!active) return null;
  const { mode, lastExportAt } = active.entry;

  return (
    <Item variant="outline">
      <ItemContent className="gap-1">
        <ItemTitle>
          <FileDownIcon className="size-4" aria-hidden />
          Export
        </ItemTitle>
        <ItemDescription>
          {mode === "local"
            ? "An encrypted backup is the only copy of this vault outside this browser."
            : "Save a copy of your vault, encrypted or for moving to another app."}{" "}
          {lastExportAt
            ? `Last backup: ${dateFormat.format(new Date(lastExportAt))}.`
            : "Not backed up yet."}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ExportDialog>
          <Button variant="outline">
            <DownloadIcon />
            Export
          </Button>
        </ExportDialog>
      </ItemActions>
    </Item>
  );
}
