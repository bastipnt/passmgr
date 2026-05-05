import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@repo/ui/components/Sheet";
import LoginItemForm from "@/forms/LoginItemForm";
import type { LoginItem } from "@repo/schema";

type EditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: Partial<LoginItem>;
  serverError: string | undefined;
  onSubmit: (values: LoginItem) => void;
  onDelete: () => void;
};

export function EditSheet({
  open,
  onOpenChange,
  defaultValues,
  serverError,
  onSubmit,
  onDelete,
}: EditSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Edit Login</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <LoginItemForm
            onSubmit={onSubmit}
            onDelete={onDelete}
            onCancel={() => onOpenChange(false)}
            serverError={serverError}
            defaultValues={defaultValues}
            action="Save"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
