import {
  newLoginValues,
  RECORD_TYPE_LABELS,
  recordFromForm,
  sharedWebsite,
  useCreateRecord,
  useTargetVault,
} from "@repo/client";
import { RECORD_TYPES, type RecordFormValues, type RecordType } from "@repo/schema";
import { OptionList, SettingsSection, toast } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
import { RecordTypePicker } from "@/features/records/components/RecordTypePicker";
import { recordPaths } from "@/route-paths";

/**
 * "New item": the type picker, then that type's form (`?type=`), as on web.
 * `?website=` fills in a new login's website (`recordPaths.createLogin`).
 */
export default function NewRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; website?: string }>();
  const type = RECORD_TYPES.find((option) => option === params.type);
  const website = params.website ? sharedWebsite(params.website) : undefined;

  if (!type) {
    return <TypePickerSheet onPick={(pick) => router.setParams({ type: pick })} />;
  }
  return (
    <NewRecordForm
      key={`${type}:${website}`}
      type={type}
      defaultValues={type === "login" && website ? newLoginValues(website) : undefined}
    />
  );
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

function NewRecordForm<T extends RecordType>({
  type,
  defaultValues,
}: {
  type: T;
  defaultValues?: Partial<RecordFormValues<T>>;
}) {
  const router = useRouter();
  const { vaultId, setVaultId, writableVaults, canPick } = useTargetVault();

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: () => {
      toast.success("Record created");
      router.back();
    },
    onError: () => toast.error("The item couldn't be saved"),
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
      defaultValues={defaultValues}
    >
      {canPick && vaultId && (
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
