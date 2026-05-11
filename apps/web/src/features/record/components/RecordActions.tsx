import { useContext, useState } from "react";
import { EditIcon, EllipsisVerticalIcon, TrashIcon, XIcon } from "lucide-react";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { SessionContext } from "@repo/client";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { isOffline } = useContext(SessionContext);
  const isMobile = useIsMobile();

  return (
    <div className={cn("flex flex-row justify-between items-center", className)}>
      <div className="flex flex-row gap-4 items-center">
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
        <div className="flex gap-4 items-center">
          <Button variant={isMobile ? "default" : "ghost"} onClick={onEdit}>
            <EditIcon /> Edit
          </Button>
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
        </div>
      )}
    </div>
  );
}
