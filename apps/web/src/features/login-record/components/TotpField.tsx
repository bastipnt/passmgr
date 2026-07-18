import { formatTotpToken, TOTP_PERIOD_MS, useTotp } from "@repo/client";
import { ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import { TotpRing } from "@repo/ui/components/TotpRing";
import { LockIcon } from "lucide-react";

type TotpFieldProps = {
  totpData: string;
  onCopy: (value: string | undefined, label: string) => void;
};

export default function TotpField({ totpData, onCopy }: TotpFieldProps) {
  const { token, isInvalid, seconds, period } = useTotp(totpData);

  return (
    <ItemDisplay
      title="2FA token (TOTP)"
      value={<span aria-live="polite">{formatTotpToken(token)}</span>}
      onClick={() => onCopy(token, "2FA token")}
      icon={<LockIcon />}
      actions={
        isInvalid ? undefined : (
          <TotpRing period={period} periodMs={TOTP_PERIOD_MS} seconds={seconds} />
        )
      }
    />
  );
}
