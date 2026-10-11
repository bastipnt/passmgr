import { useStore, useTwoFactor } from "@repo/client";
import { Button, SettingsSection } from "@repo/ui-native";
import type { RefObject } from "react";
import { Text, View } from "react-native";
import type { TwoFactorSheetRef } from "./TwoFactorSheet";

/**
 * Web's `TwoFactorSettings`: two-factor for the account's server login (TOTP
 * + backup codes), opt-in. Online accounts only; it guards the server, not
 * this phone's unlock. The changes run in `sheetRef` (mounted outside the scroll view).
 */
export function TwoFactorSection({ sheetRef }: { sheetRef: RefObject<TwoFactorSheetRef | null> }) {
  const { profile } = useStore();
  const { status, blocked } = useTwoFactor();
  if (profile?.mode !== "linked") return null;

  const enabled = status?.enabled === true;
  const left = status?.backupCodesLeft ?? 0;

  return (
    <SettingsSection
      title="Two-factor authentication"
      description="Unlocking this phone stays password-only: the code is asked when signing in to your account."
    >
      <View className="gap-3">
        <Text className="text-[16px] text-foreground">
          {blocked
            ? "Needs a connection to the server."
            : !status
              ? "Checking your account…"
              : enabled
                ? `On · ${left === 1 ? "1 backup code" : `${left} backup codes`} left`
                : "Off"}
        </Text>
        {enabled ? (
          <>
            <Button
              size="lg"
              variant="glass"
              disabled={blocked}
              onPress={() => sheetRef.current?.open("regenerate")}
            >
              New backup codes
            </Button>
            <Button
              size="lg"
              variant="destructive"
              disabled={blocked}
              onPress={() => sheetRef.current?.open("disable")}
            >
              Turn off
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            disabled={blocked || status === undefined}
            onPress={() => sheetRef.current?.open("enable")}
          >
            Turn on
          </Button>
        )}
      </View>
    </SettingsSection>
  );
}
