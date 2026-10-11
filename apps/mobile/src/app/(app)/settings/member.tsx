import {
  assignableRoles,
  LAST_OWNER_MESSAGE,
  type MemberInfo,
  NOT_JOINED_MESSAGE,
  type SharingRefusals,
  sharingErrorMessage,
  useVaultMembers,
  useVaultSharing,
  useVaults,
  VAULT_ROLE_DESCRIPTIONS,
  VAULT_ROLE_LABELS,
  type VaultInfo,
} from "@repo/client";
import type { VaultRole } from "@repo/schema";
import { Button, FieldError, OptionList, SettingsSection } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { Fingerprint } from "@/features/vaults/Fingerprint";

/**
 * One member of a shared vault, for owners and managers (web's member row in
 * `VaultMembersDialog`): their security code, their role, hand the vault over
 * (owners), remove them or withdraw the invite (which rotates the vault's key).
 */
export default function MemberScreen() {
  const { vaultId, userId } = useLocalSearchParams<{ vaultId: string; userId: string }>();
  const { getVault } = useVaults();
  const vault = getVault(vaultId);
  const { members } = useVaultMembers(vaultId);
  const current = members.find((m) => m.userId === userId);
  // Kept once they're gone (just removed): the sheet stays as it was while it closes.
  const [member, setMember] = useState(current);
  if (current && current !== member) setMember(current);
  if (!vault || !member) return null;
  return <MemberForm vault={vault} member={member} />;
}

function MemberForm({ vault, member }: { vault: VaultInfo; member: MemberInfo }) {
  const router = useRouter();
  const sharing = useVaultSharing();
  const { pending } = sharing;
  const [error, setError] = useState<string>();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foreground = useCSSVariable("--color-foreground") as string;
  const invited = member.status === "pending";
  const canTransfer = vault.role === "owner" && !invited && member.role !== "owner";

  async function run(
    action: () => Promise<void>,
    fallback: string,
    { close = false, byCode = {} }: { close?: boolean; byCode?: SharingRefusals } = {},
  ) {
    setError(undefined);
    try {
      await action();
      if (close) router.back();
    } catch (e) {
      setError(
        sharingErrorMessage(e, fallback, {
          NOT_FOUND: "They aren't in this vault any more.",
          ...byCode,
        }),
      );
    }
  }

  function changeRole(role: VaultRole) {
    if (role === member.role) return;
    void run(
      () => sharing.setMemberRole(vault.vaultId, member.userId, role),
      "The role couldn't be changed. Try again.",
      { byCode: { PRECONDITION_FAILED: LAST_OWNER_MESSAGE } },
    );
  }

  function confirmTransfer() {
    Alert.alert(
      `Make ${member.email} the owner?`,
      "They become owner of the vault and you can still manage it. Only an owner can make you owner again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hand over",
          onPress: () =>
            void run(
              () => sharing.transferOwnership(vault.vaultId, member.userId),
              "The vault couldn't be handed over. Try again.",
              { close: true, byCode: { PRECONDITION_FAILED: NOT_JOINED_MESSAGE } },
            ),
        },
      ],
    );
  }

  function confirmRemove() {
    Alert.alert(
      invited ? `Withdraw the invite for ${member.email}?` : `Remove ${member.email}?`,
      invited
        ? "They can't join with it any more. The vault gets a new key."
        : "They lose the vault on their devices. The vault gets a new key, so they can't open anything changed from now on. What they've already seen, they may have kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: invited ? "Withdraw invite" : "Remove",
          style: "destructive",
          onPress: () =>
            void run(
              () => sharing.removeMember(vault.vaultId, member.userId),
              "They couldn't be removed. Try again.",
              { close: true },
            ),
        },
      ],
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: member.email,
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              tintColor: foreground,
              onPress: () => router.back(),
            },
          ],
        }}
      />
      <ScrollView contentContainerClassName="grow gap-8 py-6">
        <SettingsSection
          title="Security code"
          description={
            member.keyTrusted
              ? "Compare it with them, by phone or in person."
              : "Their key differs from the one this device used before. Compare the code with them before sharing anything new."
          }
        >
          <Fingerprint value={member.fingerprint} />
        </SettingsSection>

        <SettingsSection flush title="Role" description={VAULT_ROLE_DESCRIPTIONS[member.role]}>
          <OptionList
            options={assignableRoles(vault.role).map((role) => ({
              value: role,
              label: VAULT_ROLE_LABELS[role],
            }))}
            value={member.role}
            onChange={changeRole}
          />
        </SettingsSection>

        {error && (
          <View className="px-5">
            <FieldError>{error}</FieldError>
          </View>
        )}

        <View className="gap-3 px-5">
          {canTransfer && (
            <Button size="lg" variant="outline" disabled={pending} onPress={confirmTransfer}>
              Make owner
            </Button>
          )}
          <Button size="lg" variant="destructive" loading={pending} onPress={confirmRemove}>
            {invited ? "Withdraw invite" : "Remove from vault"}
          </Button>
          {invited && (
            <Text className="text-muted-foreground text-xs">They haven't accepted yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
