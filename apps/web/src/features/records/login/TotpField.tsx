import { formatTotpToken, TOTP_PERIOD_MS, useTotp } from "@repo/client";
import { DetailField } from "@repo/ui/complex-components/DetailField";
import { TotpRing } from "@repo/ui/components/TotpRing";

type TotpFieldProps = {
  totpData: string;
  onCopy?: (value: string | undefined, label: string) => void;
};

export default function TotpField({ totpData, onCopy }: TotpFieldProps) {
  const { token, isInvalid, seconds, period } = useTotp(totpData);

  return (
    <DetailField
      label="One-time code"
      value={<span aria-live="polite">{formatTotpToken(token)}</span>}
      valueClassName="font-mono font-semibold text-xl tracking-[0.06em]"
      onCopy={onCopy && !isInvalid ? () => onCopy(token, "One-time code") : undefined}
      actions={
        isInvalid ? undefined : (
          <TotpRing period={period} periodMs={TOTP_PERIOD_MS} seconds={seconds} />
        )
      }
    />
  );
}
