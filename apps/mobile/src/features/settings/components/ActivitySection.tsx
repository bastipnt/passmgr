import {
  accountEventDetail,
  accountEventTitle,
  isNotableAccountEvent,
  SessionContext,
  useAccountActivity,
} from "@repo/client";
import { Button, FieldError, SectionGroup, SettingsSection, Skeleton } from "@repo/ui-native";
import { TriangleAlert } from "lucide-react-native";
import { useContext } from "react";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

/** Web's `ActivitySettings`: the account's security activity, for a linked profile. */
export function ActivitySection() {
  const { mode } = useContext(SessionContext);
  const { events, isPending, error, hasMore, loadMore, loadingMore } = useAccountActivity();
  const warning = useCSSVariable("--color-warning") as string;

  if (mode !== "online") {
    return (
      <SettingsSection title="Account activity">
        <Text className="text-muted-foreground text-sm">
          Connect to your account to see its activity.
        </Text>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      flush
      title="Account activity"
      description="Sign-ins and security changes. Something you don't recognize? Change your password and sign out the other devices."
    >
      {isPending ? (
        <View className="gap-2 px-5">
          <Skeleton height={56} borderRadius={12} />
          <Skeleton height={56} borderRadius={12} />
        </View>
      ) : error ? (
        <View className="px-5">
          <FieldError>The activity couldn't be loaded. Try again.</FieldError>
        </View>
      ) : (
        <View className="gap-3">
          <SectionGroup>
            {events.map((event) => (
              <View key={event.id} className="min-h-14 justify-center gap-1 px-5 py-2.5">
                <View className="flex-row items-center gap-1.5">
                  {isNotableAccountEvent(event) && <TriangleAlert size={14} color={warning} />}
                  <Text numberOfLines={1} className="shrink text-[16px] text-foreground">
                    {accountEventTitle(event)}
                  </Text>
                </View>
                <Text numberOfLines={1} className="text-muted-foreground text-xs">
                  {accountEventDetail(event)}
                </Text>
              </View>
            ))}
          </SectionGroup>
          {hasMore && (
            <Button
              size="lg"
              variant="glass"
              className="mx-5"
              loading={loadingMore}
              onPress={loadMore}
            >
              Show older activity
            </Button>
          )}
        </View>
      )}
    </SettingsSection>
  );
}
