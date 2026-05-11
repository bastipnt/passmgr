import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import type { LoginItem } from "@repo/schema";
import { useIsMobile } from "@/hooks/use-is-mobile";
import LoginRecordForm, {
  type LoginRecordFormHandle,
} from "@features/login-record/forms/LoginRecordForm";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { Button } from "@repo/ui/components/Button";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { TrashIcon, XIcon } from "lucide-react";
import { useRef } from "react";

type EditRecordProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: Partial<LoginItem>;
  serverError: string | undefined;
  onSubmit: (values: LoginItem) => void;
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

  function LoginRecordFormWrapper() {
    return (
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
  }

  function DeleteAction() {
    return (
      <RemoveDialog
        title="Delete item"
        description="Are you sure you want to delete this item? This action cannot be undone."
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
  }

  function FormActions() {
    return (
      <div className="flex flex-row gap-4 justify-between">
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

        <div className="flex flex-row gap-4 sm:justify-between sm:w-full">
          {!isMobile && <DeleteAction />}
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
  }

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup>
        <DrawerActions>
          <FormActions />
        </DrawerActions>
        <DrawerContent>
          <LoginRecordFormWrapper />
          <div className="py-4 flex flex-row justify-end">
            <DeleteAction />
          </div>
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-3xl!">
        <SheetHeader>
          <SheetTitle>Edit Login</SheetTitle>
        </SheetHeader>

        <div className="p-4">
          <LoginRecordFormWrapper />
        </div>

        <SheetFooter>
          <FormActions />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
