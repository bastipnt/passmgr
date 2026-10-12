import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react-native";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { useCSSVariable } from "uniwind";

export type ToastKind = "success" | "error" | "warning";

type ToastOptions = {
  description?: string;
  durationMs?: number;
};

type ToastItem = { id: number; kind: ToastKind; title: string; description?: string };

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 3_000,
  warning: 5_000,
  error: 5_000,
};

let current: ToastItem | null = null;
let nextId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismiss() {
  clearTimeout(timer);
  current = null;
  emit();
}

function show(kind: ToastKind, title: string, options: ToastOptions = {}) {
  clearTimeout(timer);
  current = { id: nextId++, kind, title, description: options.description };
  timer = setTimeout(dismiss, options.durationMs ?? DEFAULT_DURATION_MS[kind]);
  emit();
}

/** Web's sonner `toast`, one at a time: a new one replaces the one showing. Needs `<Toaster />`. */
export const toast = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  dismiss,
};

const ICONS = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert };
const COLOR_VARIABLES = {
  success: "--color-success",
  error: "--color-destructive",
  warning: "--color-warning",
} as const;

/**
 * Mount once at the app root. On iOS it renders in its own window so it shows
 * above form sheets and modals, which a root view would sit behind.
 */
export function Toaster() {
  const item = useSyncExternalStore(subscribe, () => current);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (item && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        [item.title, item.description].filter(Boolean).join(". "),
      );
    }
  }, [item]);

  return (
    <Overlay>
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 items-center px-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        {item && <ToastCard key={item.id} item={item} />}
      </View>
    </Overlay>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  if (Platform.OS !== "ios") {
    return (
      <View pointerEvents="box-none" className="absolute inset-0">
        {children}
      </View>
    );
  }
  // The native default makes VoiceOver ignore everything outside the overlay.
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
      {children}
    </FullWindowOverlay>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const color = useCSSVariable(COLOR_VARIABLES[item.kind]) as string;
  const Icon = ICONS[item.kind];

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(150)}
      // Uniwind doesn't style reanimated components: `className` would be dropped here.
      style={{ width: "100%", maxWidth: 448 }}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion={item.kind === "error" ? "assertive" : "polite"}
        accessibilityHint="Dismisses the message"
        onPress={dismiss}
        className="flex-row items-start gap-3 rounded-2xl border border-border bg-popover px-4 py-3 shadow-lg"
      >
        <Icon size={20} color={color} />
        <View className="flex-1 gap-0.5">
          <Text className="font-medium text-[15px] text-popover-foreground">{item.title}</Text>
          {item.description && (
            <Text className="text-muted-foreground text-sm">{item.description}</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
