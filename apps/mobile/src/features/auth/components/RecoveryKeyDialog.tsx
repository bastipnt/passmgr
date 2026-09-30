import { wipe } from "@repo/crypto";
import { Button } from "@repo/ui-native";
import { toBase64 } from "@repo/util";
import * as Clipboard from "expo-clipboard";
import { KeyRound } from "lucide-react-native";
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

// Color-coded chunks, as on web.
const CHUNK_COLOR = [
  "text-[#b45f00] dark:text-[#ffd08a]",
  "text-[#c8175e] dark:text-[#ff8db8]",
  "text-[#0677ab] dark:text-[#9adfff]",
  "text-[#5b3df0] dark:text-[#c3b4ff]",
];

function chunk(value: string, parts: number): string[] {
  const size = Math.ceil(value.length / parts);
  return Array.from({ length: parts }, (_, i) => value.slice(i * size, (i + 1) * size)).filter(
    Boolean,
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
              {chunk(recoveryKeyB64, 4).map((part, i) => (
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
            <Button native={false} size="lg" onPress={onConfirm} disabled={!copied}>
              I saved it
            </Button>
          </View>
        </View>
      </View>
    </DialogPortal>
  );
}
