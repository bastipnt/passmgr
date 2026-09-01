import type { DialogHandle } from "@repo/ui/components/Dialog";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import type { ReactNode } from "react";
import { useIsMobile } from "../hooks/use-is-mobile";

type ResponsiveSheetProps = {
  open: boolean;
  handle?: DialogHandle<unknown>;
  onOpenChange: (open: boolean) => void;
  /** Fires after the open/close animation finishes — use to commit navigation on close. */
  onOpenChangeComplete?: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  drawerClassName?: string;
  sheetClassName?: string;
};

function ResponsiveSheet({
  open,
  handle,
  onOpenChange,
  onOpenChangeComplete,
  children,
  title,
  actions,
  drawerClassName,
  sheetClassName,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();

  return isMobile ? (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      handle={handle}
    >
      <DrawerPopup>
        {actions && <DrawerActions>{actions}</DrawerActions>}

        <DrawerContent className={drawerClassName}>{children}</DrawerContent>
      </DrawerPopup>
    </Drawer>
  ) : (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      handle={handle}
    >
      <SheetContent side="right" className={sheetClassName}>
        {title && (
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        )}

        {children}

        {actions && <SheetFooter>{actions}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

export { ResponsiveSheet };
