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
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  drawerClassName?: string;
  sheetClassName?: string;
};

function ResponsiveSheet({
  open,
  onOpenChange,
  children,
  title,
  actions,
  drawerClassName,
  sheetClassName,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup>
        {actions && <DrawerActions>{actions}</DrawerActions>}

        <DrawerContent className={drawerClassName}>{children}</DrawerContent>
      </DrawerPopup>
    </Drawer>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
