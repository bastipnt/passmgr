import { useStore } from "@repo/client";
import { enrollBiometric } from "@repo/crypto";
import { secretsStore } from "@repo/store";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { useState } from "react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";

// TODO: fails if argon2id not finished
export default function BiometricEnrollPage() {
  const [error, setError] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [_, navigate] = useLocation();

  const store = useStore();

  function navigateNext() {
    navigate(recordPaths.index);
  }

  async function onEnroll() {
    setEnrolling(true);
    try {
      const vaultKey = secretsStore.exportVaultKeyForWorker();
      const password = secretsStore.getPassword();
      if (!password) {
        setError(true);
        return;
      }
      const material = await enrollBiometric(vaultKey, password);
      await store.vault.setBiometricKeyMaterial(material);
      secretsStore.clearPassword();

      navigateNext();
    } catch {
      setError(true);
    } finally {
      store.setBiometricDismissed(false);
      setEnrolling(false);
    }
  }

  function onDismissEnroll() {
    secretsStore.clearPassword();
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
          <p className="text-muted-foreground text-sm">
            Use fingerprint or Face ID to unlock your vault next time — no password needed.
          </p>
          {error && <FieldError errors={[{ message: "Using fingerprint to unlock failed" }]} />}
        </CardContent>
        <CardFooter className="flex flex-row justify-end gap-4">
          <Button type="button" variant="secondary" onClick={onDismissEnroll} disabled={enrolling}>
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
