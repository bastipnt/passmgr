import { useStore } from "@repo/store";
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

type RemoveVaultDialogProps = {
  children: ReactNode;
};

export default function RemoveVaultDialog({ children }: RemoveVaultDialogProps) {
  const store = useStore();

  const onRemoveVault = () => {
    void store.removeVault();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove vault</DialogTitle>
          <DialogDescription>
            This will remove the local vault data from this device. Your account and server data are
            not affected. You can log in again with your credentials.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onRemoveVault}>
            Remove vault
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
