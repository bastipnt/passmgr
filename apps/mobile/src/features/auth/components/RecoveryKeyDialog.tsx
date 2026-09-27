import { wipe } from "@repo/crypto";
import { Button } from "@repo/ui-native";
import { toBase64 } from "@repo/util";
import * as Clipboard from "expo-clipboard";
import { type ReactNode, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";

/**
 * Hosts the recovery-key dialog above the app. iOS avoids RN's `Modal`:
 * presenting an `@expo/ui` BottomSheet installs a window-level gesture recogniser
 * that outlives the sheet and cancels touches inside `RCTModalHostView`, so the
 * dialog's buttons would reach `onPressIn` but never fire `onPress`.
 * `FullWindowOverlay` renders through RN's own surface, which is unaffected.
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

type RecoveryKeyDialogProps = {
  /** Visible while set. Wiped once the user confirms. */
  recoveryKey: Uint8Array | null;
  description?: string;
  onDone: () => void;
};

/** Shows a freshly issued recovery key once; "I saved it" unlocks after copying. */
export function RecoveryKeyDialog({
  recoveryKey,
  description = "Store this key in a safe place. It is the only way to recover your vault if you forget your password. It is shown once and never sent to the server.",
  onDone,
}: RecoveryKeyDialogProps) {
  const [copied, setCopied] = useState(false);
  const recoveryKeyB64 = useMemo(() => (recoveryKey ? toBase64(recoveryKey) : ""), [recoveryKey]);

  const onCopy = async () => {
    if (!recoveryKey) return;
    await Clipboard.setStringAsync(recoveryKeyB64);
    setCopied(true);
  };

  const onConfirm = () => {
    if (recoveryKey) wipe(recoveryKey);
    setCopied(false);
    onDone();
  };

  return (
    <DialogPortal visible={recoveryKey !== null} onRequestClose={onConfirm}>
      <View className="flex-1 items-center justify-center bg-black/50 p-lg">
        <View className="w-full gap-md rounded-xl bg-card p-lg">
          <Text className="font-bold text-card-foreground text-lg">Save your recovery key</Text>
          <Text className="text-muted-foreground text-sm">{description}</Text>
          <Pressable onLongPress={onCopy}>
            <Text selectable className="text-foreground text-md">
              {recoveryKeyB64}
            </Text>
          </Pressable>
          {/* `native={false}`: SwiftUI hosts stay unmounted inside a
              `FullWindowOverlay` — see the note in `RemoveDialog`. */}
          <View className="gap-sm">
            <Button native={false} variant="outline" onPress={onCopy}>
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button native={false} onPress={onConfirm} disabled={!copied}>
              I saved it
            </Button>
          </View>
        </View>
      </View>
    </DialogPortal>
  );
}
