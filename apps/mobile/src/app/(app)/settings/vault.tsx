import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
  useGetRecords,
  useSortedRecords,
  useVaultActions,
  useVaults,
  VAULT_COLOR_LABELS,
  VAULT_COLORS,
  VAULT_ICON_LABELS,
  VAULT_ICONS,
  type VaultColor,
  type VaultIcon,
  type VaultInfo,
  vaultColor,
  vaultErrorMessage,
  vaultIcon,
} from "@repo/client";
import { vaultMetaSchema } from "@repo/schema";
import { Button, FieldError, Input, oklch, SettingsSection } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { VAULT_ICON_COMPONENTS, VaultTile } from "@/features/vaults/VaultTile";

// TODO: share logic with web

/**
 * Web's `VaultDialog` + `DeleteVaultDialog` as one form sheet: a new vault, or
 * (`?vaultId=`) rename one, change its icon and colour, or delete it after
 * typing its name.
 */
export default function VaultFormScreen() {
  const { vaultId } = useLocalSearchParams<{ vaultId?: string }>();
  const { getVault } = useVaults();
  const vault = vaultId ? getVault(vaultId) : undefined;
  // Deleted meanwhile (another device): nothing to edit.
  if (vaultId && !vault) return null;
  return <VaultForm key={vaultId ?? "new"} vault={vault} />;
}

function VaultForm({ vault }: { vault?: VaultInfo }) {
  const router = useRouter();
  const actions = useVaultActions();
  const { createVault, renameVault, pending } = actions;
  const { setVaultFilter } = useSortedRecords();
  const [name, setName] = useState(vault?.name ?? "");
  const [icon, setIcon] = useState<VaultIcon>(vault ? vaultIcon(vault) : DEFAULT_VAULT_ICON);
  const [color, setColor] = useState<VaultColor>(vault ? vaultColor(vault) : DEFAULT_VAULT_COLOR);
  const [error, setError] = useState<string>();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const [foreground, primary] = useCSSVariable([
    "--color-foreground",
    "--color-primary",
  ]) as string[];

  async function save() {
    const parsed = vaultMetaSchema.safeParse({ name, icon, color });
    if (!parsed.success) {
      setError("Give the vault a name (up to 64 characters).");
      return;
    }
    setError(undefined);
    try {
      if (vault) {
        await renameVault(vault.vaultId, parsed.data);
      } else {
        // Show the new vault right away, as web does.
        setVaultFilter(await createVault(parsed.data));
      }
      router.back();
    } catch (e) {
      setError(vaultErrorMessage(e, "The vault couldn't be saved. Try again."));
    }
  }

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: vault ? "Edit vault" : "New vault",
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
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: vault ? "Save" : "Create",
              variant: "prominent",
              tintColor: primary,
              disabled: pending,
              onPress: () => void save(),
            },
          ],
        }}
      />

      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-8 py-6"
        bottomOffset={24}
      >
        <View className="flex-row items-center gap-3.5 px-5">
          <VaultTile vault={{ icon, color }} size="lg" />
          <View className="flex-1">
            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={64}
              autoCapitalize="words"
              editable={!pending}
            />
          </View>
        </View>

        <SettingsSection title="Icon">
          <View className="flex-row flex-wrap gap-2.5">
            {VAULT_ICONS.map((option) => {
              const Icon = VAULT_ICON_COMPONENTS[option];
              const selected = option === icon;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={VAULT_ICON_LABELS[option]}
                  accessibilityState={{ selected }}
                  disabled={pending}
                  onPress={() => setIcon(option)}
                  className="size-12 items-center justify-center rounded-xl border border-foreground/10 dark:border-white/10"
                  style={
                    selected
                      ? { backgroundColor: oklch(0.92, 0.06, VAULT_COLORS[color]), borderWidth: 0 }
                      : undefined
                  }
                >
                  <Icon
                    size={20}
                    color={selected ? oklch(0.35, 0.12, VAULT_COLORS[color]) : foreground}
                  />
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        <SettingsSection title="Colour">
          <View className="flex-row flex-wrap gap-3">
            {(Object.keys(VAULT_COLORS) as VaultColor[]).map((option) => {
              const selected = option === color;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={VAULT_COLOR_LABELS[option]}
                  accessibilityState={{ selected }}
                  disabled={pending}
                  onPress={() => setColor(option)}
                  className="size-10 rounded-full"
                  style={{
                    backgroundColor: oklch(0.68, 0.16, VAULT_COLORS[option]),
                    borderWidth: selected ? 3 : 0,
                    borderColor: foreground,
                  }}
                />
              );
            })}
          </View>
        </SettingsSection>

        {error && (
          <View className="px-5">
            <FieldError>{error}</FieldError>
          </View>
        )}

        {vault && vault.kind !== "personal" && vault.role === "owner" && (
          <DeleteVaultSection vault={vault} actions={actions} />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** Web's `DeleteVaultDialog`: the vault goes with every item, once its name is typed. */
function DeleteVaultSection({
  vault,
  actions,
}: {
  vault: VaultInfo;
  actions: ReturnType<typeof useVaultActions>;
}) {
  const router = useRouter();
  const { records } = useGetRecords();
  const { deleteVault, pending } = actions;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const count = records.filter((record) => record.vaultId === vault.vaultId).length;

  async function remove() {
    try {
      await deleteVault(vault.vaultId);
      router.back();
    } catch (e) {
      setError(vaultErrorMessage(e, "The vault couldn't be deleted. Try again."));
    }
  }

  return (
    <SettingsSection
      title="Delete vault"
      description={`${count === 1 ? "Its 1 item" : `Its ${count} items`} and their history are deleted with it, on every device. This can't be undone.`}
    >
      <View className="gap-3">
        <Input
          label="Type the vault's name to confirm"
          placeholder={vault.name}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending}
        />
        {error && <FieldError>{error}</FieldError>}
        <Button
          size="lg"
          variant="destructive"
          disabled={typed.trim() !== vault.name || pending}
          loading={pending}
          onPress={() => void remove()}
        >
          Delete vault
        </Button>
      </View>
    </SettingsSection>
  );
}
