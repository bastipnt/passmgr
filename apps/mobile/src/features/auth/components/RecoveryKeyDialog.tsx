import { recoveryKeyChunks, useEmergencyKit } from "@repo/client";
import { wipe } from "@repo/crypto";
import { Button } from "@repo/ui-native";
import { toBase64 } from "@repo/util";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import { KeyRound } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
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

// Color-coded chunks, as on web.
const CHUNK_COLOR = [
  "text-[#b45f00] dark:text-[#ffd08a]",
  "text-[#c8175e] dark:text-[#ff8db8]",
  "text-[#0677ab] dark:text-[#9adfff]",
  "text-[#5b3df0] dark:text-[#c3b4ff]",
];

type RecoveryKeyDialogProps = {
  /** Visible while set. Wiped once the user confirms. */
  recoveryKey: Uint8Array | null;
  description?: string;
  /** The account's email, printed on the emergency kit; absent for a local vault. */
  email?: string;
  /** The profile's display name, printed on the emergency kit. */
  name?: string;
  onDone: () => void;
};

/**
 * Shows a freshly issued recovery key once; "I saved it" unlocks after copying
 * it, or on iOS after printing the emergency kit (a PDF built on the device;
 * the print sheet also saves or shares it). Android's print dialog resolves on
 * cancel too, so there only copying counts.
 */
export function RecoveryKeyDialog({
  recoveryKey,
  description = "Store this key in a safe place. It is the only way to recover your vault if you forget your password. It is shown once and never sent to the server.",
  email,
  name,
  onDone,
}: RecoveryKeyDialogProps) {
  const { copied, markCopied, kitSaved, kitBusy, saved, saveKit, reset } = useEmergencyKit(
    recoveryKey,
    { email, name },
  );
  const recoveryKeyB64 = useMemo(() => (recoveryKey ? toBase64(recoveryKey) : ""), [recoveryKey]);
  const chunks = useMemo(() => (recoveryKey ? recoveryKeyChunks(recoveryKey) : []), [recoveryKey]);

  const onCopy = async () => {
    if (!recoveryKey) return;
    await Clipboard.setStringAsync(recoveryKeyB64);
    markCopied();
  };

  const onSaveKit = async () => {
    const result = await saveKit(async (kit) => {
      // A data URI: no file with the key is left in the app's storage.
      await Print.printAsync({ uri: `data:application/pdf;base64,${toBase64(kit.bytes)}` });
      // iOS rejects a print closed without printing or saving.
      return Platform.OS === "ios";
    });
    if (result === "failed") {
      Alert.alert("Emergency kit", "The emergency kit couldn't be created. Copy the key instead.");
    }
  };

  const onConfirm = () => {
    if (recoveryKey) wipe(recoveryKey);
    reset();
    onDone();
  };

  return (
    // Hidden while iOS prints: the print sheet presents from the app's window,
    // under the overlay's.
    <DialogPortal
      visible={recoveryKey !== null && !(kitBusy && Platform.OS === "ios")}
      onRequestClose={() => {
        if (!kitBusy) onConfirm();
      }}
    >
      <View className="flex-1 items-center justify-center bg-black/50 p-5">
        <View className="w-full gap-5 rounded-3xl border border-foreground/10 bg-popover p-6">
          <View className="gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
              <KeyRound size={20} color="#ffffff" />
            </View>
            <Text className="font-display-bold text-[22px] text-popover-foreground tracking-[-0.4px]">
              Save your recovery key
            </Text>
            <Text className="text-muted-foreground text-sm leading-5">{description}</Text>
          </View>
          {/* Color-coded chunks make the key easier to transcribe and compare. One
              `Text` so selecting it yields the exact key. */}
          <Pressable
            onLongPress={onCopy}
            className="rounded-2xl border border-foreground/10 bg-foreground/3 px-5 py-4 dark:border-white/10 dark:bg-black/30"
          >
            <Text selectable className="font-mono-medium text-sm leading-6">
              {chunks.map((part, i) => (
                <Text key={i} className={CHUNK_COLOR[i % CHUNK_COLOR.length]}>
                  {part}
                </Text>
              ))}
            </Text>
          </Pressable>
          {/* `native={false}`: SwiftUI hosts stay unmounted inside a
              `FullWindowOverlay` — see the note in `RemoveDialog`. */}
          <View className="gap-2.5">
            <Button native={false} variant="outline" size="lg" onPress={onCopy}>
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button
              native={false}
              variant="outline"
              size="lg"
              loading={kitBusy}
              onPress={onSaveKit}
            >
              {kitSaved ? "Emergency kit saved" : "Print or save emergency kit"}
            </Button>
            <Button native={false} size="lg" onPress={onConfirm} disabled={!saved}>
              I saved it
            </Button>
          </View>
        </View>
      </View>
    </DialogPortal>
  );
}
