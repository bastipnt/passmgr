import { useEnrollBiometric, useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { CheckIcon, FingerprintIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";

export default function BiometricEnrollPage() {
  const [error, setError] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [_, navigate] = useLocation();

  const store = useStore();
  const { enroll, dismiss } = useEnrollBiometric();

  function navigateNext() {
    navigate(recordPaths.index);
  }

  async function onEnroll() {
    setEnrolling(true);
    try {
      await enroll();
      navigateNext();
    } catch (e) {
      console.error("Biometric enrollment failed", e);
      setError(true);
    } finally {
      store.setBiometricDismissed(false);
      setEnrolling(false);
    }
  }

  function onDismissEnroll() {
    dismiss();
    navigateNext();
  }

  return (
    <section className="w-full max-w-md justify-self-center lg:col-span-2">
      <Card variant="glass">
        <PageMeta title="Biometric unlock" noindex />
        <CardHeader className="gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <FingerprintIcon className="size-7" aria-hidden />
          </span>
          <CardTitle>Enable biometric unlock?</CardTitle>
          <CardDescription>
            Use fingerprint or Face ID to unlock your vault next time — no password needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2 text-muted-foreground text-sm">
            {["Stays on this device only", "Turn it off anytime in Settings"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckIcon className="size-4 text-primary dark:text-ring" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          {error && <FieldError variant="box">Using fingerprint to unlock failed</FieldError>}
        </CardContent>
        <CardFooter className="grid grid-cols-[2fr_3fr] gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onDismissEnroll}
            disabled={enrolling}
          >
            Skip
          </Button>
          <Button type="button" size="lg" onClick={onEnroll} disabled={enrolling}>
            Enable
            {enrolling && <Spinner data-icon="inline-end" />}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
