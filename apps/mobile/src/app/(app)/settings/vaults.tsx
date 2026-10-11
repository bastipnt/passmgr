import {
  itemCount,
  type OpenedInvitation,
  ownFingerprint,
  type RevokedVaultInfo,
  SessionContext,
  sharingErrorMessage,
  useGetRecords,
  useRevokedVaults,
  useVaultActions,
  useVaultInvitations,
  useVaultSharing,
  useVaults,
  VAULT_ROLE_LABELS,
  vaultAccessLabel,
  vaultErrorMessage,
} from "@repo/client";
import { canManageVault } from "@repo/schema";
import { Button, FieldError, Screen, SectionGroup, SettingsSection } from "@repo/ui-native";
import { Stack, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useContext, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { Fingerprint } from "@/features/vaults/Fingerprint";
import { VaultTile } from "@/features/vaults/VaultTile";
import { settingsPaths } from "@/route-paths";

/**
 * Web's Settings → Vaults: every vault and a new one. A shared vault opens its
 * members (and from there its form sheet), the personal one its form sheet.
 * Invites, changes from lost vaults and the user's own security code show too.
 */
export default function VaultsScreen() {
  const router = useRouter();
  const { vaults } = useVaults();
  const { records } = useGetRecords();
  const { canChangeVaults } = useVaultActions();
  const { mode } = useContext(SessionContext);
  const fingerprint = mode === "online" ? ownFingerprint() : undefined;
  const [primary, muted] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]) as string[];

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.vaultId, (counts.get(record.vaultId) ?? 0) + 1);

  return (
    <Screen>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "New vault",
              accessibilityLabel: "New vault",
              icon: { type: "sfSymbol", name: "plus" },
              tintColor: primary,
              disabled: !canChangeVaults,
              onPress: () => router.navigate(settingsPaths.vault()),
            },
          ],
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <Invitations />
        <RevokedVaults />

        <SettingsSection
          flush
          title="Your vaults"
          description={
            canChangeVaults
              ? "New items go into Personal unless you pick another vault."
              : "You're offline. Vaults change on the server, so connect to create, edit, delete or share one."
          }
        >
          <SectionGroup>
            {vaults.map((vault) => {
              const access = vaultAccessLabel(vault);
              const shared = vault.kind === "shared";
              const editable = canChangeVaults && canManageVault(vault.role);
              const opens = shared || editable;
              return (
                <Pressable
                  key={vault.vaultId}
                  accessibilityRole="button"
                  accessibilityLabel={`${vault.name}, ${itemCount(counts.get(vault.vaultId) ?? 0)}`}
                  disabled={!opens}
                  onPress={() =>
                    router.navigate(
                      shared
                        ? settingsPaths.vaultMembers(vault.vaultId)
                        : settingsPaths.vault(vault.vaultId),
                    )
                  }
                  className="h-16 flex-row items-center gap-3.5 px-5 active:bg-foreground/5"
                >
                  <VaultTile vault={vault} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
                      {vault.name}
                    </Text>
                    <Text className="text-muted-foreground text-sm">
                      {itemCount(counts.get(vault.vaultId) ?? 0)}
                      {access ? ` · ${access}` : ""}
                    </Text>
                  </View>
                  {opens && <ChevronRight size={18} color={muted} />}
                </Pressable>
              );
            })}
          </SectionGroup>
        </SettingsSection>

        {fingerprint && (
          <SettingsSection
            title="Your security code"
            description="Someone sharing a vault with you sees this code for you. Read it to them so they know the vault key reaches you and nobody else."
          >
            <Fingerprint value={fingerprint} />
          </SettingsSection>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Web's `VaultInvitations`: invites to other people's vaults, accepted after comparing the code. */
function Invitations() {
  const { invitations } = useVaultInvitations();
  const { acceptInvitation, declineInvitation, pending } = useVaultSharing();
  const [error, setError] = useState<string>();

  if (invitations.length === 0) return null;

  async function accept({ invitation }: OpenedInvitation) {
    setError(undefined);
    try {
      await acceptInvitation(invitation);
    } catch (e) {
      setError(
        sharingErrorMessage(e, "The invite couldn't be accepted. Try again.", {
          NOT_FOUND: "This invite was withdrawn.",
          CONFLICT: "The vault's key changed meanwhile. Ask them to invite you again.",
        }),
      );
    }
  }

  async function decline({ invitation }: OpenedInvitation) {
    setError(undefined);
    try {
      await declineInvitation(invitation.vaultId);
    } catch (e) {
      setError(sharingErrorMessage(e, "The invite couldn't be declined. Try again."));
    }
  }

  function confirmAccept(opened: OpenedInvitation) {
    Alert.alert(
      `Join “${opened.meta.name}”?`,
      `Compare ${opened.invitation.sender.email}'s security code with them:\n\n${opened.senderFingerprint}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Join", onPress: () => void accept(opened) },
      ],
    );
  }

  return (
    <SettingsSection
      flush
      title="Invites"
      description="Accept only if the code matches the one they see under Settings → Vaults."
    >
      <SectionGroup>
        {invitations.map((opened) => (
          <View key={opened.invitation.vaultId} className="gap-3 px-5 py-3">
            <View className="flex-row items-center gap-3.5">
              <VaultTile vault={opened.meta} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
                  {opened.meta.name}
                </Text>
                <Text className="text-muted-foreground text-sm">
                  {opened.invitation.sender.email} · {VAULT_ROLE_LABELS[opened.invitation.role]}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              <Button
                className="flex-1"
                variant="outline"
                disabled={pending}
                onPress={() => void decline(opened)}
              >
                Decline
              </Button>
              <Button className="flex-1" disabled={pending} onPress={() => confirmAccept(opened)}>
                Accept
              </Button>
            </View>
          </View>
        ))}
      </SectionGroup>
      {error && (
        <View className="px-5">
          <FieldError>{error}</FieldError>
        </View>
      )}
    </SettingsSection>
  );
}

function changes(count: number): string {
  return count === 1 ? "1 unsent change" : `${count} unsent changes`;
}

/** Web's `RevokedVaults`: unsent changes from vaults the user lost, to copy or discard. */
function RevokedVaults() {
  const revoked = useRevokedVaults();
  const { copyRevokedRecords, discardRevokedVault, pending } = useVaultSharing();
  const [error, setError] = useState<string>();

  if (revoked.length === 0) return null;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(vaultErrorMessage(e, fallback));
    }
  }

  function confirmDiscard(vault: RevokedVaultInfo) {
    Alert.alert(`Discard ${changes(vault.records.length)}?`, "They can't be brought back.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () =>
          void run(
            () => discardRevokedVault(vault.vaultId),
            "The changes couldn't be discarded. Try again.",
          ),
      },
    ]);
  }

  return (
    <SettingsSection flush title="Changes from vaults you lost">
      <SectionGroup>
        {revoked.map((vault) => (
          <View key={vault.vaultId} className="gap-3 px-5 py-3">
            <View>
              <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
                {vault.name ?? "A vault"}
              </Text>
              <Text className="text-muted-foreground text-sm">
                You're no longer in this vault. {changes(vault.records.length)} never reached it.
                {vault.unreadable > 0 ? ` ${vault.unreadable} can't be opened any more.` : ""}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Button
                className="flex-1"
                variant="ghost-destructive"
                disabled={pending}
                onPress={() => confirmDiscard(vault)}
              >
                Discard
              </Button>
              {vault.records.length > 0 && (
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={pending}
                  onPress={() =>
                    void run(
                      () => copyRevokedRecords(vault.vaultId),
                      "The changes couldn't be copied. Try again.",
                    )
                  }
                >
                  Copy to my vault
                </Button>
              )}
            </View>
          </View>
        ))}
      </SectionGroup>
      {error && (
        <View className="px-5">
          <FieldError>{error}</FieldError>
        </View>
      )}
    </SettingsSection>
  );
}
