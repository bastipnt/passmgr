import { formatTotpToken, TOTP_PERIOD_MS, useTotp } from "@repo/client";
import { RecordDetailsItem, TotpRing } from "@repo/ui-native";
import { Lock } from "lucide-react-native";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useCSSVariable } from "uniwind";

type TotpFieldProps = {
  totpData: string;
  onCopy: (value?: string) => void;
};

export default function TotpField({ totpData, onCopy }: TotpFieldProps) {
  const { token, seconds, period, resync } = useTotp(totpData);
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

  // Timers pause while backgrounded — pull a fresh token when the app returns.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") resync();
    });
    return () => subscription.remove();
  }, [resync]);

  return (
    <RecordDetailsItem
      icon={<Lock size={20} color={iconColor} />}
      title="2FA token (TOTP)"
      value={formatTotpToken(token)}
      onCopy={() => onCopy(token)}
      accessory={<TotpRing period={period} periodMs={TOTP_PERIOD_MS} seconds={seconds} />}
    />
  );
}
