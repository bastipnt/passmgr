import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Screen,
} from "@repo/ui-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FileQuestion } from "lucide-react-native";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useCSSVariable } from "uniwind";
import Record, { useRecordParam } from "@/features/records/components/Record";
import { useCopyField } from "@/features/records/use-copy-field";
import { useScrollTitle } from "@/hooks/use-scroll-title";
import { recordPaths } from "@/route-paths";

/** Scroll offset past which the hero title has left the screen and the bar shows it. */
const TITLE_IN_BAR_OFFSET = 64;

export default function RecordScreen() {
  const { recordId } = useLocalSearchParams();
  const { record, ready } = useRecordParam(recordId);
  // Logins and Wi-Fi networks have a password worth a bar button.
  const password =
    record?.type === "login" || record?.type === "wifi" ? record.password : undefined;
  const onCopy = useCopyField();
  const [primary, foreground] = useCSSVariable([
    "--color-primary",
    "--color-foreground",
  ]) as string[];
  const { scrollProps, titleInBar, contentTopPadding, restAnchor } =
    useScrollTitle(TITLE_IN_BAR_OFFSET);

  return (
    <Screen>
      {/* The hero carries the title; the bar only picks it up once the hero has
          scrolled away — the native take on web's collapsing page title. */}
      <Stack.Screen
        options={{
          title: titleInBar ? (record?.title ?? "") : "",
          // Web's bottom-dock "Copy password" as a bar item: a bottom toolbar
          // would sit under the tab bar. Items run from the trailing edge in.
          // Nothing to edit or copy until the record exists.
          unstable_headerRightItems: () =>
            record
              ? [
                  {
                    type: "button" as const,
                    label: "Edit",
                    // iOS 26 tinted glass; falls back to a plain button below it.
                    variant: "prominent" as const,
                    tintColor: primary,
                    onPress: () => router.navigate(recordPaths.editRecord(recordId as string)),
                  },
                  ...(password
                    ? [
                        {
                          type: "button" as const,
                          label: "Copy password",
                          accessibilityLabel: "Copy password",
                          icon: { type: "sfSymbol" as const, name: "doc.on.doc" as const },
                          tintColor: foreground,
                          onPress: () => onCopy(password),
                        },
                      ]
                    : []),
                ]
              : [],
        }}
      />

      <Animated.ScrollView
        {...scrollProps}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: contentTopPadding }}
      >
        {restAnchor}
        {record ? (
          <Record record={record} />
        ) : ready ? (
          <View className="px-5 pt-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileQuestion size={20} color="#ffffff" />
                </EmptyMedia>
                <EmptyTitle>Record not found</EmptyTitle>
                <EmptyDescription>It may have been deleted on another device.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </View>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
