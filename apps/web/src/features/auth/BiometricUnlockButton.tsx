import { useBiometricUnlock } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { FieldError, FieldSeparator } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { FingerprintIcon } from "lucide-react";
import { useState } from "react";

type BiometricUnlockButtonProps = {
  loading: boolean;
  setLoading: (newLoadingState: boolean) => void;
};

/** "or" divider plus the biometric unlock action, rendered inside the login card. */
export function BiometricUnlockButton({ loading, setLoading }: BiometricUnlockButtonProps) {
  const { unlock } = useBiometricUnlock();
  const [error, setError] = useState(false);

  const onBiometricUnlock = async () => {
    setLoading(true);
    setError(false);

    try {
      await unlock();
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <>
      <FieldSeparator>or</FieldSeparator>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full font-medium"
        onClick={onBiometricUnlock}
        disabled={loading}
      >
        {loading ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <FingerprintIcon data-icon="inline-start" />
        )}
        Unlock with biometrics
      </Button>
      {error && <FieldError variant="box">Error using biometric unlock</FieldError>}
    </>
  );
}
