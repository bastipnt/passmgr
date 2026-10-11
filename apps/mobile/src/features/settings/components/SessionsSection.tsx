import { SessionContext, sessionDetail, sessionLabel, useSessions } from "@repo/client";
import type { SessionInfo } from "@repo/schema";
import {
  Badge,
  Button,
  FieldError,
  SectionGroup,
  SettingsSection,
  Skeleton,
} from "@repo/ui-native";
import { LogOut } from "lucide-react-native";
import { useContext, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

const FAILED = "The device couldn't be signed out. Try again.";

/**
 * Web's `SessionsSettings`: the account's signed-in devices, for a linked
 * profile. Tap another device to sign it out, or sign out all others. A
 * signed-out device locks; its local vault and unsynced changes stay.
 */
export function SessionsSection() {
  const { mode } = useContext(SessionContext);
  const { sessions, isPending, error: loadError, revoke, revokeOthers, pending } = useSessions();
  const [error, setError] = useState<string>();
  const muted = useCSSVariable("--color-muted-foreground") as string;
  const others = sessions.filter((s) => !s.current);

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch {
      setError(FAILED);
    }
  }

  function confirmRevoke(session: SessionInfo) {
    const name = sessionLabel(session);
    Alert.alert(`Sign out ${name}?`, "It locks and needs the master password to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void run(() => revoke(session.id)) },
    ]);
  }

  function confirmRevokeOthers() {
    Alert.alert(
      "Sign out all other devices?",
      "Every other device locks and needs the master password to sign in again. This phone stays signed in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out others", style: "destructive", onPress: () => void run(revokeOthers) },
      ],
    );
  }

  if (mode !== "online") {
    return (
      <SettingsSection title="Signed-in devices">
        <Text className="text-muted-foreground text-sm">
          Connect to your account to see where you are signed in.
        </Text>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      flush
      title="Signed-in devices"
      description="A signed-out device locks and needs the master password again. Its unsynced changes stay on it."
    >
      {isPending ? (
        <View className="gap-2 px-5">
          <Skeleton height={56} borderRadius={12} />
          <Skeleton height={56} borderRadius={12} />
        </View>
      ) : loadError ? (
        <View className="px-5">
          <FieldError>Your devices couldn't be loaded. Try again.</FieldError>
        </View>
      ) : (
        <View className="gap-3">
          <SectionGroup>
            {sessions.map((session) => {
              const name = sessionLabel(session);
              return (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  accessibilityLabel={session.current ? `${name}, this device` : `Sign out ${name}`}
                  disabled={session.current || pending}
                  onPress={() => confirmRevoke(session)}
                  className="min-h-14 flex-row items-center gap-3 px-5 py-2.5 active:bg-foreground/5"
                >
                  <View className="flex-1 gap-1">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text numberOfLines={1} className="shrink text-[16px] text-foreground">
                        {name}
                      </Text>
                      {session.current && <Badge variant="secondary">This device</Badge>}
                    </View>
                    <Text className="text-muted-foreground text-xs">{sessionDetail(session)}</Text>
                  </View>
                  {!session.current && <LogOut size={18} color={muted} />}
                </Pressable>
              );
            })}
          </SectionGroup>
          {error && (
            <View className="px-5">
              <FieldError>{error}</FieldError>
            </View>
          )}
          {others.length > 0 && (
            <Button
              size="lg"
              variant="glass"
              className="mx-5"
              loading={pending}
              onPress={confirmRevokeOthers}
            >
              Sign out other devices
            </Button>
          )}
        </View>
      )}
    </SettingsSection>
  );
}
