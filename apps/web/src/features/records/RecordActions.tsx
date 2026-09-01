import { SessionContext, ShortcutLayer } from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { EditIcon, EllipsisVerticalIcon, Timeline, TrashIcon, XIcon } from "lucide-react";
import { useContext, useState } from "react";
import { recordPaths } from "@/app/route-paths";

type MoreDropdownProps = {
  recordId: string;
  onDelete: () => void;
  isMobile: boolean;
};

function MoreDropdown({ recordId, onDelete, isMobile }: MoreDropdownProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={isMobile ? "outline" : "ghost"}
              size="icon"
              className="rounded-full sm:rounded-lg"
            >
              <EllipsisVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={recordPaths.recordVersions(recordId)} />}>
            <Timeline /> Versions
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <TrashIcon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShortcutLayer active={deleteDialogOpen}>
        <RemoveDialog
          title="Delete item"
          description="Are you sure you want to delete this item? This action cannot be undone."
          removeTitle="Delete"
          onRemove={onDelete}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      </ShortcutLayer>
    </>
  );
}

type RecordActionsProps = {
  recordId: string;
  title: string;
  onDelete: () => void;
  onSetOpen?: (o: boolean) => void;
  className?: string;
};

export function RecordActions({
  recordId,
  title,
  onDelete,
  onSetOpen,
  className,
}: RecordActionsProps) {
  const { isOffline } = useContext(SessionContext);
  const isMobile = useIsMobile();

  return (
    <div className={cn("flex flex-row items-center justify-between", className)}>
      <div className="flex flex-row items-center gap-4">
        {isMobile && onSetOpen && (
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => onSetOpen(false)}
          >
            <XIcon />
          </Button>
        )}

        <h1>{title}</h1>
      </div>

      {!isOffline && (
        <div className="flex items-center gap-4">
          <Link variant={isMobile ? "default" : "ghost"} href={recordPaths.editRecord(recordId)}>
            <EditIcon /> Edit
          </Link>
          <MoreDropdown recordId={recordId} isMobile={isMobile} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}
