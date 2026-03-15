import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/Dialog";
import type { ReactNode } from "react";

type RemoveDialogProps = {
  title: string;
  description: string;
  children: ReactNode;
  removeTitle: string;
  onRemove: () => void;
};

export default function RemoveDialog({
  title,
  description,
  children,
  removeTitle,
  onRemove,
}: RemoveDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onRemove}>
            {removeTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
