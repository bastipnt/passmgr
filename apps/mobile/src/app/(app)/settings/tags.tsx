import { itemCount, useTags } from "@repo/client";
import { Screen, SectionGroup, SettingsSection } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { ChevronRight, Tag } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { settingsPaths } from "@/route-paths";

/** Web's Settings → Tags: every tag in use; a tap opens its sheet (rename, remove). */
export default function TagsScreen() {
  const router = useRouter();
  const tags = useTags();
  const muted = useCSSVariable("--color-muted-foreground") as string;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        {tags.length === 0 ? (
          <Text className="px-5 text-muted-foreground text-sm">
            No tags yet. Add tags to an item when you edit it, then filter the list by them.
          </Text>
        ) : (
          <SettingsSection
            flush
            title="Your tags"
            description="Renaming a tag onto one already in use merges the two."
          >
            <SectionGroup>
              {tags.map(({ tag, count }) => (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityLabel={`${tag}, ${itemCount(count)}`}
                  onPress={() => router.navigate(settingsPaths.tag(tag))}
                  className="h-14 flex-row items-center gap-3.5 px-5 active:bg-foreground/5"
                >
                  <Tag size={18} color={muted} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
                      {tag}
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-sm">{itemCount(count)}</Text>
                  <ChevronRight size={18} color={muted} />
                </Pressable>
              ))}
            </SectionGroup>
          </SettingsSection>
        )}
      </ScrollView>
    </Screen>
  );
}
