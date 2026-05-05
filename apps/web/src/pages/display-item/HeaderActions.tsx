import { useState } from "react";
import { EditIcon, EllipsisVerticalIcon, TrashIcon } from "lucide-react";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";

type HeaderActionsProps = {
  title: string;
  isOffline: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function HeaderActions({ title, isOffline, onEdit, onDelete }: HeaderActionsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center">
      <h1>{title}</h1>
      {!isOffline && (
        <div className="flex gap-2 items-center">
          <Button variant="ghost" onClick={onEdit}>
            <EditIcon /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
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
