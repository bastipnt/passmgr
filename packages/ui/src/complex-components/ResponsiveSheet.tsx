import { Button } from "@repo/ui/components/Button";
import type { DialogHandle } from "@repo/ui/components/Dialog";
import {
  Drawer,
  DrawerActions,
  DrawerClose,
  DrawerContent,
  DrawerPopup,
} from "@repo/ui/components/Drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import { cn } from "@repo/ui/lib/utils";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useIsMobile } from "../hooks/use-is-mobile";

type ResponsiveSheetProps = {
  open: boolean;
  handle?: DialogHandle<unknown>;
  onOpenChange: (open: boolean) => void;
  /** Fires after the open/close animation finishes — use to commit navigation on close. */
  onOpenChangeComplete?: (open: boolean) => void;
  title?: string;
  /** Subtitle under the sheet title (desktop). */
  description?: ReactNode;
  /** Leading slot in the sheet header, e.g. the record's avatar or a back button (desktop). */
  media?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  drawerClassName?: string;
  sheetClassName?: string;
};

/**
 * Publishes the sticky header's height as --sheet-header-h on the scroll
 * content, so rows inside it can pin right beneath the header.
 */
function publishHeaderHeight(header: HTMLDivElement | null) {
  const content = header?.parentElement;
  if (!header || !content) return;
  const observer = new ResizeObserver(() => {
    content.style.setProperty("--sheet-header-h", `${header.offsetHeight}px`);
  });
  observer.observe(header);
  return () => {
    observer.disconnect();
    content.style.removeProperty("--sheet-header-h");
  };
}

function ResponsiveSheet({
  open,
  handle,
  onOpenChange,
  onOpenChangeComplete,
  children,
  title,
  description,
  media,
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
          <SheetHeader
            ref={publishHeaderHeight}
            className="flex-row items-center justify-start gap-4"
          >
            {media}
            <div className="flex min-w-0 flex-col gap-0.5">
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </div>
          </SheetHeader>
        )}

        {children}

        {actions && <SheetFooter>{actions}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

/*
 * Sheet actions share one 48px row height: text buttons use `size="lg"`,
 * icon-only buttons use `SheetIconAction`.
 */

/** Round icon-only sheet action, the same height as `lg` text actions. */
function SheetIconAction({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" size="icon-xl" className={cn("rounded-full", className)} {...props} />
  );
}

/** Closes the mobile drawer; renders nothing on desktop, where the sheet has its own X. */
function SheetCloseAction({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <DrawerClose render={<SheetIconAction className={className} aria-label="Close" />}>
      <XIcon />
    </DrawerClose>
  );
}

export { ResponsiveSheet, SheetCloseAction, SheetIconAction };
