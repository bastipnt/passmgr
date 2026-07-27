import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";

import { Button } from "../Button";

type RemoveDialogBaseProps = {
  title: string;
  description: string;
  removeTitle: string;
  onRemove: () => void;
  /** Label for the dismiss button. Defaults to "Close". */
  closeTitle?: string;
};

type UncontrolledRemoveDialogProps = RemoveDialogBaseProps & {
  /** Trigger element; cloned with an `onPress` that opens the dialog. */
  children: ReactElement<{ onPress?: () => void }>;
  open?: never;
  onOpenChange?: never;
};

type ControlledRemoveDialogProps = RemoveDialogBaseProps & {
  children?: never;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type RemoveDialogProps = UncontrolledRemoveDialogProps | ControlledRemoveDialogProps;

/**
 * Hosts the dialog above the rest of the app.
 *
 * iOS deliberately avoids RN's `Modal`: presenting an `@expo/ui` BottomSheet
 * installs a window-level gesture recogniser that outlives the sheet and
 * cancels touches inside `RCTModalHostView`, so presses reach `onPressIn` but
 * never complete as `onPress`. `FullWindowOverlay` renders through RN's own
 * surface instead, which is unaffected. Android has no native sheet presented
 * over RN, so `Modal` is fine there.
 */
function DialogPortal({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  if (Platform.OS === "ios") {
    if (!visible) return null;
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </FullWindowOverlay>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

/**
 * Confirmation dialog for destructive actions. Mirrors the web
 * `RemoveDialog`: controlled via `open`/`onOpenChange`, or uncontrolled
 * with a trigger element passed as `children`.
 */
export function RemoveDialog({
  title,
  description,
  removeTitle,
  onRemove,
  closeTitle = "Close",
  children,
  open,
  onOpenChange,
}: RemoveDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  function setOpen(next: boolean) {
    if (isControlled) {
      onOpenChange(next);
    } else {
      setInternalOpen(next);
    }
  }

  const trigger =
    children && isValidElement(children)
      ? cloneElement(children, { onPress: () => setOpen(true) })
      : null;

  return (
    <>
      {trigger}

      <DialogPortal visible={isOpen} onRequestClose={() => setOpen(false)}>
        {/*
         * Backdrop is a sibling *behind* the card rather than its parent.
         * Nesting pressables made each ancestor take the responder off its
         * child mid-press, so only the outermost one ever fired.
         */}
        <Pressable
          style={StyleSheet.absoluteFill}
          className="bg-black/50"
          onPress={() => setOpen(false)}
        />

        {/* `box-none`: this layer never captures, but its children can. */}
        <View
          className="flex-1 items-center justify-center p-lg"
          pointerEvents="box-none"
          collapsable={false}
        >
          {/* Claims the responder so card taps don't fall through to the
              backdrop, without being a pressable ancestor of the buttons. */}
          <View
            className="w-full max-w-[400px] gap-md rounded-xl border border-border bg-background p-lg"
            onStartShouldSetResponder={() => true}
          >
            <View className="gap-sm">
              <Text className="text-lg font-semibold text-foreground">{title}</Text>
              <Text className="text-sm text-muted-foreground">{description}</Text>
            </View>

            <View className="flex-row justify-end gap-sm">
              <Button variant="secondary" onPress={() => setOpen(false)}>
                {closeTitle}
              </Button>
              <Button
                variant="destructive"
                onPress={() => {
                  setOpen(false);
                  // Deferred: `onRemove` typically unmounts this dialog. Running
                  // it in the same batch tears the overlay down while it is
                  // still visible, leaving its window behind to swallow touches.
                  requestAnimationFrame(onRemove);
                }}
              >
                {removeTitle}
              </Button>
            </View>
          </View>
        </View>
      </DialogPortal>
    </>
  );
}
