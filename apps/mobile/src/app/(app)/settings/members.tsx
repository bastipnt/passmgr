import {
  LAST_OWNER_MESSAGE,
  SessionContext,
  sharingErrorMessage,
  useVaultActions,
  useVaultMembers,
  useVaultSharing,
  useVaults,
  VAULT_ROLE_LABELS,
  type VaultInfo,
} from "@repo/client";
import { canAssignRole, canManageVault } from "@repo/schema";
import {
  Badge,
  type BottomSheetRef,
  Button,
  FieldError,
  Screen,
  SectionGroup,
  SettingsSection,
  Skeleton,
} from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useContext, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { CreateAccountSheet } from "@/features/settings/components/CreateAccountSheet";
import { VaultTile } from "@/features/vaults/VaultTile";
import { settingsPaths } from "@/route-paths";

/**
 * Web's `VaultMembersDialog` as a page: a shared vault's members with their
 * security codes; owners and managers invite (header) and open a member's
 * sheet; anyone but the last owner leaves. A local profile is offered an
 * online account first, offline it waits for the connection.
 */
export default function MembersScreen() {
  const { vaultId } = useLocalSearchParams<{ vaultId: string }>();
  const { getVault } = useVaults();
  const current = getVault(vaultId);
  // Kept once the vault goes (left, removed): the page stays as it was while it pops.
  const [vault, setVault] = useState(current);
  if (current && current !== vault) setVault(current);
  if (!vault) return null;
  return <Members vault={vault} />;
}

function Members({ vault }: { vault: VaultInfo }) {
  const router = useRouter();
  const { mode } = useContext(SessionContext);
  const { canChangeVaults } = useVaultActions();
  const createAccountRef = useRef<BottomSheetRef>(null);
  const [primary, foreground] = useCSSVariable([
    "--color-primary",
    "--color-foreground",
  ]) as string[];
  const manages = canManageVault(vault.role);
  const online = mode === "online";

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: vault.name,
          // Editing works wherever vaults change (local too); inviting needs the server.
          unstable_headerRightItems: () => [
            ...(manages && canChangeVaults
              ? [
                  {
                    type: "button" as const,
                    label: "Edit",
                    accessibilityLabel: `Edit ${vault.name}`,
                    icon: { type: "sfSymbol" as const, name: "pencil" as const },
                    tintColor: foreground,
                    onPress: () => router.navigate(settingsPaths.vault(vault.vaultId)),
                  },
                ]
              : []),
            ...(manages && online
              ? [
                  {
                    type: "button" as const,
                    label: "Invite",
                    accessibilityLabel: "Invite people",
                    icon: { type: "sfSymbol" as const, name: "person.badge.plus" as const },
                    tintColor: primary,
                    onPress: () => router.navigate(settingsPaths.inviteMember(vault.vaultId)),
                  },
                ]
              : []),
          ],
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <View className="flex-row items-center gap-3.5 px-5">
          <VaultTile vault={vault} size="lg" />
          <Text numberOfLines={2} className="flex-1 font-display-bold text-2xl text-foreground">
            {vault.name}
          </Text>
        </View>

        {mode === "local" && (
          <SettingsSection
            title="Share"
            description="Sharing goes through the server: create an online account for this vault first. Your password and recovery key stay the same."
          >
            <Button size="lg" onPress={() => createAccountRef.current?.triggerShowHide(true)}>
              Create online account
            </Button>
          </SettingsSection>
        )}
        {mode === "offline" && (
          <Text className="px-5 text-muted-foreground text-sm">
            You're offline. Members and sharing need the server; the vault's items stay usable
            meanwhile.
          </Text>
        )}
        {online && <MemberList vault={vault} />}
      </ScrollView>
      {mode === "local" && <CreateAccountSheet ref={createAccountRef} />}
    </Screen>
  );
}

function MemberList({ vault }: { vault: VaultInfo }) {
  const router = useRouter();
  const { members, isPending, error: loadError } = useVaultMembers(vault.vaultId);
  const { leaveVault, pending } = useVaultSharing();
  const [error, setError] = useState<string>();
  const muted = useCSSVariable("--color-muted-foreground") as string;

  const owners = members.filter((m) => m.role === "owner" && m.status === "active").length;
  // Unknown while the list didn't load: the server refuses the last owner anyway.
  const lastOwner = vault.role === "owner" && !loadError && owners <= 1;

  async function leave() {
    setError(undefined);
    try {
      await leaveVault(vault.vaultId);
      router.back();
    } catch (e) {
      setError(
        sharingErrorMessage(e, "You couldn't leave the vault. Try again.", {
          PRECONDITION_FAILED: LAST_OWNER_MESSAGE,
        }),
      );
    }
  }

  function confirmLeave() {
    Alert.alert(
      `Leave “${vault.name}”?`,
      "Its items disappear from your devices. Unsent changes are kept aside so you can copy them to another vault. To get back in, someone has to invite you again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave vault", style: "destructive", onPress: () => void leave() },
      ],
    );
  }

  return (
    <>
      <SettingsSection
        flush
        title="Members"
        description="Compare a security code with its person before you trust it."
      >
        {isPending ? (
          <View className="gap-2 px-5">
            <Skeleton height={64} borderRadius={12} />
            <Skeleton height={64} borderRadius={12} />
          </View>
        ) : loadError ? (
          <View className="px-5">
            <FieldError>The members couldn't be loaded. Try again.</FieldError>
          </View>
        ) : (
          <SectionGroup>
            {members.map((member) => {
              const manageable = !member.isSelf && canAssignRole(vault.role, member.role);
              return (
                <Pressable
                  key={member.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`${member.email}, ${VAULT_ROLE_LABELS[member.role]}`}
                  disabled={!manageable}
                  onPress={() =>
                    router.navigate(settingsPaths.vaultMember(vault.vaultId, member.userId))
                  }
                  className="min-h-16 flex-row items-center gap-3 px-5 py-2.5 active:bg-foreground/5"
                >
                  <View className="flex-1 gap-1">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text numberOfLines={1} className="shrink text-[16px] text-foreground">
                        {member.email}
                      </Text>
                      {member.isSelf && <Badge variant="secondary">You</Badge>}
                      {member.status === "pending" && <Badge variant="outline">Invited</Badge>}
                      {!member.keyTrusted && <Badge variant="warning">Key changed</Badge>}
                    </View>
                    <Text selectable className="font-mono text-muted-foreground text-xs">
                      {member.fingerprint}
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-sm">
                    {VAULT_ROLE_LABELS[member.role]}
                  </Text>
                  {manageable && <ChevronRight size={18} color={muted} />}
                </Pressable>
              );
            })}
          </SectionGroup>
        )}
      </SettingsSection>

      <SettingsSection
        title="Leave"
        description={
          lastOwner ? LAST_OWNER_MESSAGE : "You can rejoin only if someone invites you again."
        }
      >
        <View className="gap-3">
          {error && <FieldError>{error}</FieldError>}
          <Button
            size="lg"
            variant="destructive"
            disabled={lastOwner || isPending}
            loading={pending}
            onPress={confirmLeave}
          >
            Leave vault
          </Button>
        </View>
      </SettingsSection>
    </>
  );
}
