import { secretsStore } from "@repo/client";
import { useStore } from "@repo/store";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { enrollBiometric } from "@utils/webauthn";
import { useState } from "react";
import { useLocation } from "wouter";

export default function BiometricEnrollPage() {
  const [error, setError] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [_, navigate] = useLocation();

  const store = useStore();

  function navigateNext() {
    navigate("/");
  }

  async function onEnroll() {
    setEnrolling(true);
    try {
      const vaultKey = secretsStore.exportVaultKeyForWorker();
      const material = await enrollBiometric(vaultKey);
      await store.localStore.setBiometricKeyMaterial(material);

      navigateNext();
    } catch {
      setError(true);
    } finally {
      store.setBiometricDismissed(false);
      setEnrolling(false);
    }
  }

  function onDismissEnroll() {
    store.setBiometricDismissed(true);
    navigateNext();
  }

  return (
    <section className="w-xs max-w-full">
      <Card>
        <CardHeader>
          <CardTitle>Enable Biometric Unlock?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use fingerprint or Face ID to unlock your vault next time — no password needed.
          </p>
          {error && <FieldError errors={[{ message: "Using fingerprint to unlock failed" }]} />}
        </CardContent>
        <CardFooter className="flex flex-row gap-4 justify-end">
          <Button type="button" variant="outline" onClick={onDismissEnroll} disabled={enrolling}>
            Skip
          </Button>
          <Button type="button" onClick={onEnroll} disabled={enrolling}>
            Enable
            {enrolling && <Spinner data-icon="inline-start" />}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
