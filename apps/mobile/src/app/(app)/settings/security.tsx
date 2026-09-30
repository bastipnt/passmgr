import {
  AUTO_LOCK_CHOICES,
  AUTO_LOCK_DEFAULT_MINUTES,
  CLIPBOARD_CLEAR_CHOICES,
  CLIPBOARD_CLEAR_DEFAULT_SECONDS,
  PREF_KEYS,
  REVEAL_TIMEOUT_CHOICES,
  REVEAL_TIMEOUT_DEFAULT_SECONDS,
} from "@repo/client";
import { Screen } from "@repo/ui-native";
import { ScrollView } from "react-native";
import { SettingsChoice } from "@/features/settings/components/SettingsChoice";

export default function SecuritySettingsScreen() {
  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <SettingsChoice
          title="Clear clipboard"
          description="Applies to values you copy out of a record."
          choices={CLIPBOARD_CLEAR_CHOICES}
          prefKey={PREF_KEYS.clipboardClearSeconds}
          fallback={CLIPBOARD_CLEAR_DEFAULT_SECONDS}
        />

        <SettingsChoice
          title="Lock when backgrounded"
          description="Locking clears every key from memory, so you sign in again on return. Anything you were editing but had not saved is lost."
          choices={AUTO_LOCK_CHOICES}
          prefKey={PREF_KEYS.autoLockMinutes}
          fallback={AUTO_LOCK_DEFAULT_MINUTES}
        />

        <SettingsChoice
          title="Hide revealed values again"
          description="Applies to passwords and hidden custom fields after you reveal them."
          choices={REVEAL_TIMEOUT_CHOICES}
          prefKey={PREF_KEYS.revealTimeoutSeconds}
          fallback={REVEAL_TIMEOUT_DEFAULT_SECONDS}
        />
      </ScrollView>
    </Screen>
  );
}
