import {
  RECORD_TYPE_LABELS,
  recordFromForm,
  useCreateRecord,
  useSortedRecords,
  useVaults,
} from "@repo/client";
import { RECORD_TYPES, type RecordFormValues, type RecordType } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { OptionList, SettingsSection } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
import { RecordTypePicker } from "@/features/records/components/RecordTypePicker";
import { recordPaths } from "@/route-paths";

/** "New item": the type picker, then that type's form (`?type=`), as on web. */
export default function NewRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = RECORD_TYPES.find((option) => option === params.type);

  if (!type) {
    return <TypePickerSheet onPick={(pick) => router.setParams({ type: pick })} />;
  }
  return <NewRecordForm key={type} type={type} />;
}

function TypePickerSheet({ onPick }: { onPick: (type: RecordType) => void }) {
  const router = useRouter();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: "New item",
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
          unstable_headerRightItems: () => [],
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="py-4">
        <RecordTypePicker onPick={onPick} />
      </ScrollView>
    </>
  );
}

// TODO: share logic with web
/** Web's `useTargetVault`: the vault in view when writable, else the personal one. */
function useTargetVault() {
  const { vaultFilter } = useSortedRecords();
  const { writableVaults } = useVaults();
  const inView = writableVaults.find((vault) => vault.vaultId === vaultFilter)?.vaultId;
  const [vaultId, setVaultId] = useState(inView ?? secretsStore.defaultVaultId);
  return { vaultId, setVaultId, writableVaults };
}

function NewRecordForm<T extends RecordType>({ type }: { type: T }) {
  const router = useRouter();
  const { vaultId, setVaultId, writableVaults } = useTargetVault();

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record created");
      router.back();
    },
  });

  const onSubmit = (data: RecordFormValues<T>) => {
    createRecord(recordFromForm(type, data), vaultId);
  };

  return (
    <RecordFormSheet
      type={type}
      onSubmit={onSubmit}
      serverError={createRecordError?.message}
      pending={createPending}
      action="Create"
      title={`New ${RECORD_TYPE_LABELS[type].noun}`}
      generatorPath={recordPaths.createGeneratePassword}
    >
      {writableVaults.length > 1 && vaultId && (
        <View className="-mx-5">
          <SettingsSection flush title="Vault">
            <OptionList
              options={writableVaults.map((vault) => ({ value: vault.vaultId, label: vault.name }))}
              value={vaultId}
              onChange={setVaultId}
            />
          </SettingsSection>
        </View>
      )}
    </RecordFormSheet>
  );
}
