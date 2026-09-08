import { useGetRecord } from "@repo/client";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { recordPaths } from "@/route-paths";

export default function RecordLayout() {
  const contentStyle = useResolveClassNames("bg-background");
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const primaryColor = useCSSVariable("--color-primary") as string;
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  const { recordId } = useLocalSearchParams();
  const { record } = useGetRecord((recordId as string) || "");

  // `PasswordGeneratorProvider` lives in the parent layout — shared with the
  // create sheet.
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          contentStyle,
          headerTitleStyle,
          title: record?.title || "",
          headerTransparent: true,
          /*
           * The header buttons have to be native `UIBarButtonItem`s. A React
           * element passed to `headerLeft`/`headerRight` is wrapped in a
           * custom-view bar item, and iOS 26 paints its own liquid glass
           * capsule behind that — a glass button of ours would then sit *on*
           * that capsule and sample it instead of the content scrolling under
           * the transparent header. Only the real bar items track the scroll
           * view.
           *
           * The back item has to be ours: this screen is the first route of
           * its own stack, so `canGoBack` is false here and the system back
           * button never renders — `router.back()` pops the parent stack.
           */
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "Back",
              accessibilityLabel: "Back",
              icon: { type: "sfSymbol", name: "chevron.backward" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Edit",
              // iOS 26 tinted glass; falls back to a plain button below it.
              variant: "prominent",
              tintColor: primaryColor,
              onPress: () => router.navigate(recordPaths.editRecord(recordId as string)),
            },
          ],
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle,
        }}
      />
      <Stack.Screen
        name="generate-password"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle,
        }}
      />
      <Stack.Screen
        name="versions"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          // Taller than the default half sheet — a diff of a full record runs long.
          sheetAllowedDetents: [0.6, 1],
          contentStyle,
        }}
      />
    </Stack>
  );
}
