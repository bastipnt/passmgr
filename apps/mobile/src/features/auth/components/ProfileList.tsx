import { profileLabel, unsyncedChangesWarning, useRemoveFromDevice, useStore } from "@repo/client";
import type { ProfileEntry } from "@repo/store";
import { RemoveDialog } from "@repo/ui-native";
import { ChevronRight, HardDrive } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

type ProfileListProps = {
  /** Open this profile's unlock. */
  onPick: (profileId: string) => void;
};

/**
 * The profiles on this device (ADR 0001 D2), each a shortcut to its unlock,
 * and a way to remove them all. Shown on the welcome screen once there is
 * more than one profile (a single one is the "Unlock" button's).
 */
export function ProfileList({ onPick }: ProfileListProps) {
  const { profiles, active, countPendingChanges } = useStore();
  const { removeAll, removing } = useRemoveFromDevice();
  const muted = useCSSVariable("--color-muted-foreground") as string;
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<number>();

  if (profiles.length === 0) return null;

  async function confirmRemoveAll() {
    setPending(undefined);
    setConfirming(true);
    try {
      const linked = profiles.filter((p) => p.mode === "linked");
      const counts = await Promise.all(linked.map((p) => countPendingChanges(p.profileId)));
      setPending(counts.reduce((sum, n) => sum + n, 0));
    } catch (e) {
      console.error("Counting unsynced changes failed", e);
    }
  }

  const local = profiles.filter((p) => p.mode === "local").length;
  const description = [
    "Accounts and their data on the server are not affected.",
    local > 0 &&
      (local === 1
        ? " One vault has no account: this is its only copy, everything in it is lost for good."
        : ` ${local} vaults have no account: these are their only copies, everything in them is lost for good.`),
    unsyncedChangesWarning(pending),
  ]
    .filter(Boolean)
    .join("");

  return (
    <View className="gap-2">
      <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        On this device
      </Text>
      {profiles.map((profile) => (
        <ProfileRow
          key={profile.profileId}
          profile={profile}
          selected={profile.profileId === active?.entry.profileId}
          muted={muted}
          onPress={() => onPick(profile.profileId)}
        />
      ))}
      <Pressable
        className="self-center pt-1"
        hitSlop={8}
        accessibilityRole="button"
        disabled={removing}
        onPress={() => void confirmRemoveAll()}
      >
        <Text className="text-muted-foreground text-xs underline">
          Remove all vaults from this device
        </Text>
      </Pressable>
      <RemoveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={
          profiles.length === 1 ? "Remove the vault?" : `Remove all ${profiles.length} vaults?`
        }
        description={description}
        removeTitle="Remove all"
        closeTitle="Cancel"
        onRemove={() => {
          setConfirming(false);
          void removeAll();
        }}
      />
    </View>
  );
}

function ProfileRow({
  profile,
  selected,
  muted,
  onPress,
}: {
  profile: ProfileEntry;
  selected: boolean;
  muted: string;
  onPress: () => void;
}) {
  const label = profileLabel(profile);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Unlock ${label}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-foreground/10 bg-white/50 p-3 active:opacity-70 dark:border-white/10 dark:bg-white/5"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
        {profile.mode === "linked" ? (
          <Text className="font-display-bold text-lg text-primary-foreground">
            {label.charAt(0).toUpperCase()}
          </Text>
        ) : (
          <HardDrive size={18} color="white" />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-semibold text-foreground text-sm">
          {label}
        </Text>
        <Text className="text-muted-foreground text-xs">
          {profile.mode === "linked" ? "Synced with your account" : "No account · not synced"}
        </Text>
      </View>
      <ChevronRight size={16} color={muted} />
    </Pressable>
  );
}
