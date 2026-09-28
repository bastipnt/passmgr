"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

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
  return <div className={cn("mx-auto mb-4 h-1 w-12 rounded-full bg-border")} />;
}

/**
 * Handle and actions pinned to the top of the drawer. At rest it shows the
 * drawer's own ground; content scrolled beneath is frosted, tinted with the
 * popover color (lightly in light mode).
 */
function DrawerActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-slot="drawer-actions"
      className={cn(
        "sticky-bar px-4 pt-2 pb-4 [--sticky-bar-fill:color-mix(in_oklab,var(--color-popover)_55%,transparent)] dark:[--sticky-bar-fill:color-mix(in_oklab,var(--color-popover)_85%,transparent)]",
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
          {/* z-0: its own stacking context, so backdrop-filter on floating
              controls inside it can sample the scrolled content (Chrome). */}
          <div className="scrollbar-rounded relative z-0 h-full touch-auto overflow-y-auto overscroll-contain">
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
  DrawerActions,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerPopup,
  DrawerProvider,
  DrawerTitle,
  DrawerTrigger,
};
