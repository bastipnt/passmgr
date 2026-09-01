import { ShortcutLayer } from "@repo/client";
import type { LoginRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { TrashIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import LoginRecordForm, { type LoginRecordFormHandle } from "./login/LoginRecordForm";

type EditRecordProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: Partial<LoginRecord>;
  serverError: string | undefined;
  onSubmit: (values: LoginRecord) => void;
  onDelete: () => void;
};

export default function EditRecord({
  open,
  onOpenChange,
  defaultValues,
  serverError,
  onSubmit,
  onDelete,
}: EditRecordProps) {
  const isMobile = useIsMobile();
  const formRef = useRef<LoginRecordFormHandle>(null);

  const form = (
    <LoginRecordForm
      onSubmit={onSubmit}
      onDelete={onDelete}
      onCancel={() => onOpenChange(false)}
      serverError={serverError}
      defaultValues={defaultValues}
      action="Save"
      ref={formRef}
    />
  );

  const deleteAction = (
    <RemoveDialog
      title="Delete record"
      description="Are you sure you want to delete this record? This action cannot be undone."
      removeTitle="Delete"
      onRemove={onDelete}
    >
      <Button
        variant={isMobile ? "destructive" : "ghost-destructive"}
        type="button"
        className="text-destructive"
      >
        <TrashIcon /> Delete
      </Button>
    </RemoveDialog>
  );

  const formActions = (
    <div className="flex flex-row justify-between gap-4">
      {isMobile && (
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => onOpenChange(false)}
        >
          <XIcon />
        </Button>
      )}
      <div className="flex flex-row gap-4 sm:w-full sm:justify-between">
        {!isMobile && deleteAction}
        <div className="flex flex-row gap-4">
          {!isMobile && (
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button onClick={() => formRef.current?.triggerSubmit()}>Save</Button>
        </div>
      </div>
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerPopup>
            <DrawerActions>{formActions}</DrawerActions>
            <DrawerContent>
              {form}
              <div className="flex flex-row justify-end py-4">{deleteAction}</div>
            </DrawerContent>
          </DrawerPopup>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="sm:max-w-3xl!">
            <SheetHeader>
              <SheetTitle>Edit Login</SheetTitle>
            </SheetHeader>

            <div className="p-4">{form}</div>

            <SheetFooter>{formActions}</SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </ShortcutLayer>
  );
}
