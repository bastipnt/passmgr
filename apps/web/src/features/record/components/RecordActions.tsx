import { SessionContext } from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { EditIcon, EllipsisVerticalIcon, Timeline, TrashIcon, XIcon } from "lucide-react";
import { useContext, useState } from "react";

type MoreDropdownProps = {
  onDelete: () => void;
  isMobile: boolean;
};

function MoreDropdown({ onDelete, isMobile }: MoreDropdownProps) {
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
          <DropdownMenuItem onClick={() => {}}>
            <Timeline /> Versions
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <TrashIcon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RemoveDialog
        title="Delete item"
        description="Are you sure you want to delete this item? This action cannot be undone."
        removeTitle="Delete"
        onRemove={onDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

type RecordActionsProps = {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
  onSetOpen?: (o: boolean) => void;
  className?: string;
};

export function RecordActions({
  title,
  onEdit,
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
          <Button variant={isMobile ? "default" : "ghost"} onClick={onEdit}>
            <EditIcon /> Edit
          </Button>
          <MoreDropdown isMobile={isMobile} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}
