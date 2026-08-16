import {
  Alert,
  Host,
  Spacer,
  Button as SwiftUIButton,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import { cloneElement, isValidElement, type ReactElement, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
 * The SwiftUI alert is presented by the hosting controller, not drawn inside
 * the host's box, so the host only has to exist in the tree — it never needs
 * a size or any touch handling of its own.
 */
const hiddenHost = { position: "absolute", width: 0, height: 0 } as const;

/**
 * Confirmation dialog for destructive actions. Mirrors the web
 * `RemoveDialog`: controlled via `open`/`onOpenChange`, or uncontrolled
 * with a trigger element passed as `children`.
 *
 * iOS presents the system alert (`@expo/ui`); Android renders an RN `Modal`.
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

  if (Platform.OS === "ios") {
    return (
      <>
        {trigger}

        <Host style={hiddenHost} pointerEvents="none">
          <Alert
            title={title}
            isPresented={isOpen}
            onIsPresentedChange={(presented) => {
              // Fires when the alert dismisses itself (a button, or a swipe on
              // an iPad popover), which the RN state has to follow.
              if (!presented) setOpen(false);
            }}
          >
            {/*
             * `.alert` is a modifier on the trigger view, so the slot must hold
             * a real SwiftUI view — an empty one drops the presentation. The
             * RN trigger above stays the visible one; `Spacer` inside the
             * zero-sized host paints nothing.
             */}
            <Alert.Trigger>
              <Spacer />
            </Alert.Trigger>
            <Alert.Message>
              <SwiftUIText>{description}</SwiftUIText>
            </Alert.Message>
            <Alert.Actions>
              <SwiftUIButton label={closeTitle} role="cancel" onPress={() => setOpen(false)} />
              <SwiftUIButton
                label={removeTitle}
                role="destructive"
                onPress={() => {
                  setOpen(false);
                  onRemove();
                }}
              />
            </Alert.Actions>
          </Alert>
        </Host>
      </>
    );
  }

  return (
    <>
      {trigger}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
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
              <Text className="font-semibold text-foreground text-lg">{title}</Text>
              <Text className="text-muted-foreground text-sm">{description}</Text>
            </View>

            <View className="flex-row justify-end gap-sm">
              <Button variant="secondary" onPress={() => setOpen(false)}>
                {closeTitle}
              </Button>
              <Button
                variant="destructive"
                onPress={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                {removeTitle}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
