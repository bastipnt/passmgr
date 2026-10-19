import { useBiometricUnlock } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { FingerprintIcon } from "lucide-react";
import type { ReactNode } from "react";

type BiometricUnlockButtonProps = {
  loading: boolean;
  setLoading: (newLoadingState: boolean) => void;
  onFailed: () => void;
  variant?: "default" | "outline";
  children: ReactNode;
};

export function BiometricUnlockButton({
  loading,
  setLoading,
  onFailed,
  variant = "default",
  children,
}: BiometricUnlockButtonProps) {
  const { unlock } = useBiometricUnlock();

  const onBiometricUnlock = async () => {
    setLoading(true);
    try {
      await unlock();
    } catch {
      setLoading(false);
      onFailed();
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      className="w-full"
      onClick={onBiometricUnlock}
      disabled={loading}
    >
      {loading ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <FingerprintIcon data-icon="inline-start" />
      )}
      {children}
    </Button>
  );
}
