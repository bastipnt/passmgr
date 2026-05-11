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
import type { ReactElement } from "react";

type RemoveDialogBaseProps = {
  title: string;
  description: string;
  removeTitle: string;
  onRemove: () => void;
};

type UncontrolledRemoveDialogProps = RemoveDialogBaseProps & {
  children: ReactElement;
  open?: never;
  onOpenChange?: never;
};

type ControlledRemoveDialogProps = RemoveDialogBaseProps & {
  children?: never;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type RemoveDialogProps = UncontrolledRemoveDialogProps | ControlledRemoveDialogProps;

export default function RemoveDialog({
  title,
  description,
  children,
  removeTitle,
  onRemove,
  open,
  onOpenChange,
}: RemoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger render={children} />}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary">Close</Button>} />
          <Button variant="destructive" onClick={onRemove}>
            {removeTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
