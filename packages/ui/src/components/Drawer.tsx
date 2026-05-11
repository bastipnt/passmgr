"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react";

import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

import styles from "./Drawer.module.css";

/**
 * Wrapper for Base-UI Drawer
 *
 * @see https://base-ui.com/react/components/drawer
 */
function Drawer({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerViewport({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Viewport>) {
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      className={cn("fixed inset-0 flex items-end justify-center")}
      {...props}
    />
  );
}

function DrawerHandle() {
  return <div className={cn("w-12 h-1 mb-4 mx-auto rounded-full bg-border")} />;
}

function DrawerActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-slot="drawer-actions"
      className={cn(
        "sticky top-0 left-0 right-0 pt-2 pb-4 z-10 backdrop-blur-xs bg-popover/80",
        className,
      )}
    >
      <DrawerHandle />
      {children}
    </div>
  );
}

function DrawerBackdrop({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
  return (
    <DrawerPrimitive.Backdrop data-slot="drawer-backdrop" className={styles.backdrop} {...props} />
  );
}

const drawerPopupVariants = cva(cn(styles.popup), {
  variants: {
    side: {
      top: "",
      right: "",
      bottom: "",
      left: "",
    },
  },
  defaultVariants: {
    side: "bottom",
  },
});

function DrawerPopup({
  side = "bottom",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup> & VariantProps<typeof drawerPopupVariants>) {
  return (
    <DrawerPortal>
      <DrawerBackdrop />
      <DrawerViewport data-side={side}>
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-side={side}
          className={cn(drawerPopupVariants({ side }), className)}
          translate="no"
          {...props}
        >
          <div className="overflow-y-auto overscroll-contain touch-auto h-full px-4">
            {children}
          </div>
        </DrawerPrimitive.Popup>
      </DrawerViewport>
    </DrawerPortal>
  );
}

function DrawerContent({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn("py-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" {...props} />;
}

function DrawerDescription({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot="drawer-description" {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerIndent({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Indent>) {
  return <DrawerPrimitive.Indent data-slot="drawer-indent" className={styles.indent} {...props} />;
}

function DrawerIndentBackground({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.IndentBackground>) {
  return (
    <DrawerPrimitive.IndentBackground
      data-slot="drawer-indent-background"
      className={cn("absolute inset-0 bg-black")}
      {...props}
    />
  );
}

function DrawerProvider({
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Provider>) {
  return (
    <DrawerPrimitive.Provider {...props}>
      <DrawerIndentBackground />
      <DrawerIndent>{children}</DrawerIndent>
    </DrawerPrimitive.Provider>
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerPopup,
  DrawerTitle,
  DrawerActions,
  DrawerHandle,
  DrawerDescription,
  DrawerClose,
  DrawerProvider,
};
