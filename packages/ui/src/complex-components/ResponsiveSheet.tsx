import { Button } from "@repo/ui/components/Button";
import type { DialogHandle } from "@repo/ui/components/Dialog";
import {
  Drawer,
  DrawerActions,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerPopup,
  DrawerTitle,
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
  titleClassName?: string;
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
  titleClassName,
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
              <SheetTitle className={titleClassName}>{title}</SheetTitle>
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

/**
 * The phone drawer's title row, for its `actions` (the desktop sheet shows
 * `title` / `description` in its own header). `children` sit after the close button.
 */
function SheetDrawerHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-row items-center gap-2">
      <SheetCloseAction />
      {children}
      <div className="ml-1 flex min-w-0 flex-col">
        <DrawerTitle className="truncate font-bold font-display text-lg leading-6 tracking-[-0.02em]">
          {title}
        </DrawerTitle>
        {description && (
          <DrawerDescription className="truncate text-muted-foreground text-xs">
            {description}
          </DrawerDescription>
        )}
      </div>
    </div>
  );
}

/** The phone drawer's page bar for a form: close, the title centred, the form's action. */
function SheetFormBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
      <SheetCloseAction className="justify-self-start" />
      <DrawerTitle className="truncate text-center font-semibold text-[0.95rem]">
        {title}
      </DrawerTitle>
      <div className="justify-self-end">{action}</div>
    </div>
  );
}

/** The top of a phone drawer's content: what it's about, under the page bar. */
function SheetMediaHeader({
  media,
  title,
  description,
  children,
}: {
  media: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-row items-center gap-3">
      {media}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && (
          <p className="truncate font-bold font-display text-[1.625rem] leading-8 tracking-[-0.02em]">
            {title}
          </p>
        )}
        {description && <p className="line-clamp-2 text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export {
  ResponsiveSheet,
  SheetCloseAction,
  SheetDrawerHeader,
  SheetFormBar,
  SheetIconAction,
  SheetMediaHeader,
};
