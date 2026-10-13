import {
  InvalidTagError,
  itemCount,
  type TagCount,
  tagEditSummary,
  useTagActions,
  useTags,
} from "@repo/client";
import { MAX_TAG_LENGTH, tagKey } from "@repo/schema";
import { Button, Input, SettingsSection, toast } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";

/** Web's rename and remove dialogs as one form sheet for the tag in `?tag=`. */
export default function TagFormScreen() {
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const tags = useTags();
  const current = tag ? tags.find((own) => tagKey(own.tag) === tagKey(tag)) : undefined;
  // Gone meanwhile (removed here or on another device): nothing to edit.
  if (!current) return null;
  return <TagForm key={current.tag} tag={current} />;
}

function TagForm({ tag }: { tag: TagCount }) {
  const router = useRouter();
  const { renameTag, deleteTag, pending } = useTagActions();
  const [name, setName] = useState(tag.tag);
  const [error, setError] = useState<string>();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const [foreground, primary] = useCSSVariable([
    "--color-foreground",
    "--color-primary",
  ]) as string[];

  async function save() {
    setError(undefined);
    try {
      const result = await renameTag(tag.tag, name);
      router.back();
      toast.success(tagEditSummary(`Renamed “${tag.tag}”`, result));
    } catch (e) {
      setError(
        e instanceof InvalidTagError ? e.message : "The tag couldn't be renamed. Try again.",
      );
    }
  }

  async function remove() {
    try {
      const result = await deleteTag(tag.tag);
      router.back();
      toast.success(tagEditSummary(`Removed “${tag.tag}”`, result));
    } catch {
      setError("The tag couldn't be removed. Try again.");
    }
  }

  function confirmRemove() {
    Alert.alert(
      `Remove “${tag.tag}”?`,
      `It comes off ${itemCount(tag.count)}, on every device. The items stay.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove tag", style: "destructive", onPress: () => void remove() },
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
          title: "Edit tag",
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
              label: "Save",
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
        <View className="gap-3 px-5">
          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            maxLength={MAX_TAG_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            error={error}
          />
        </View>

        <SettingsSection
          title="Remove tag"
          description={`It comes off ${itemCount(tag.count)}. The items stay.`}
        >
          <Button
            size="lg"
            variant="destructive"
            disabled={pending}
            loading={pending}
            onPress={confirmRemove}
          >
            Remove tag
          </Button>
        </SettingsSection>
      </KeyboardAwareScrollView>
    </View>
  );
}
