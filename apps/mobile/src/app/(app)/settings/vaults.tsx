import { useGetRecords, useVaultActions, useVaults, vaultAccessLabel } from "@repo/client";
import { canManageVault } from "@repo/schema";
import { Screen, SectionGroup, SettingsSection } from "@repo/ui-native";
import { Stack, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { VaultTile } from "@/features/vaults/VaultTile";
import { settingsPaths } from "@/route-paths";

function itemCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

/** Web's Settings → Vaults: every vault, a new one, and the form sheet per vault. */
export default function VaultsScreen() {
  const router = useRouter();
  const { vaults } = useVaults();
  const { records } = useGetRecords();
  const { canChangeVaults } = useVaultActions();
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
        <SettingsSection
          flush
          title="Your vaults"
          description={
            canChangeVaults
              ? "New items go into Personal unless you pick another vault."
              : "You're offline. Vaults change on the server, so connect to create, edit or delete one."
          }
        >
          <SectionGroup>
            {vaults.map((vault) => {
              const access = vaultAccessLabel(vault);
              const editable = canChangeVaults && canManageVault(vault.role);
              return (
                <Pressable
                  key={vault.vaultId}
                  accessibilityRole="button"
                  accessibilityLabel={`${vault.name}, ${itemCount(counts.get(vault.vaultId) ?? 0)}`}
                  disabled={!editable}
                  onPress={() => router.navigate(settingsPaths.vault(vault.vaultId))}
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
                  {editable && <ChevronRight size={18} color={muted} />}
                </Pressable>
              );
            })}
          </SectionGroup>
        </SettingsSection>
      </ScrollView>
    </Screen>
  );
}
