import { useTotp } from "@/hooks/use-totp";
import { ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { LockIcon } from "lucide-react";

type TotpFieldProps = {
  totpData: string;
  onCopy: (value: string | undefined, label: string) => void;
};

export default function TotpField({ totpData, onCopy }: TotpFieldProps) {
  const { progress, seconds, token } = useTotp(totpData);

  return (
    <ItemDisplay
      title="2FA token (TOTP)"
      value={token}
      onClick={() => onCopy(token, "2FA token")}
      icon={<LockIcon />}
      actions={<CircleProgress progress={progress ?? 0}>{seconds}</CircleProgress>}
    />
  );
}
