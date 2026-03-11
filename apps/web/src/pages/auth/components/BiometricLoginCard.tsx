import { Button } from "@repo/ui/components/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { FingerprintIcon } from "lucide-react";
import { useContext, useState } from "react";
import { SessionContext, useLogin, useStore, useUnlock } from "@repo/client";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { secretsStore } from "@repo/store";
import { authenticateBiometric } from "@repo/crypto";

type BiometricLoginCardParams = {
  loading: boolean;
  setLoading: (newLoadingState: boolean) => void;
};

export function BiometricLoginCard({ loading, setLoading }: BiometricLoginCardParams) {
  const { unlockWithVaultKey } = useContext(SessionContext);
  const { loginUser } = useLogin();
  const { storeKeyMaterial } = useUnlock();
  const [error, setError] = useState(false);
  const store = useStore();

  const onBiometricUnlock = async () => {
    if (!store.biometricKeyMaterial) return;
    setLoading(true);
    setError(false);

    try {
      const { vaultKey, password } = await authenticateBiometric(store.biometricKeyMaterial);
      const email = store.vaultKeyMaterial?.email;

      if (navigator.onLine && email) {
        const unlockInfo = await loginUser(email, password);

        if (unlockInfo) {
          unlockWithVaultKey(vaultKey);
          await storeKeyMaterial(email, unlockInfo.userPasswordKeys);
        } else {
          // OPAQUE failed — fall back to offline
          unlockWithVaultKey(vaultKey, true);
        }
      } else {
        unlockWithVaultKey(vaultKey, true);
      }

      decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
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
