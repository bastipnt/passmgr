import { Button } from "@repo/ui/components/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { FingerprintIcon } from "lucide-react";
import { useState } from "react";
import { useUnlock } from "@repo/client";

type BiometricLoginCardParams = {
  loading: boolean;
  setLoading: (newLoadingState: boolean) => void;
};

export function BiometricLoginCard({ loading, setLoading }: BiometricLoginCardParams) {
  const { biometricUnlock } = useUnlock();
  const [error, setError] = useState(false);

  // TODO: move to unlock
  const onBiometricUnlock = async () => {
    setLoading(true);
    setError(false);

    try {
      await biometricUnlock();
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FingerprintIcon className="size-12 mx-auto" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Button type="button" className="w-full" onClick={onBiometricUnlock} disabled={loading}>
          Unlock with biometrics
          {loading && <Spinner data-icon="inline-start" />}
        </Button>
        {error && <FieldError errors={[{ message: "Error using biometric unlock" }]} />}
      </CardContent>
    </Card>
  );
}
