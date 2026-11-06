import { Button } from "@repo/ui/components/Button";
import { Card, CardContent } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import AuthCardHeader from "./AuthCardHeader";
import StoredAccountRow from "./StoredAccountRow";
import type { useStartDemo } from "./use-start-demo";

type DemoUnlockCardProps = {
  name: string | null;
  hue?: number;
  onSwitch: () => void;
  /** The page's: starting a new demo switches profiles, which unmounts this card for a moment. */
  demo: ReturnType<typeof useStartDemo>;
};

/** The unlock of a demo vault: its password is known, so no field, biometrics or recovery. */
export default function DemoUnlockCard({ name, hue, onSwitch, demo }: DemoUnlockCardProps) {
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const busy = opening || demo.preparing;

  async function continueDemo() {
    setOpenFailed(false);
    setOpening(true);
    try {
      if (!(await demo.continueDemo())) setOpenFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card variant="glass" flatOnPhone>
      <AuthCardHeader title="Unlock passmgr" />
      <CardContent className="flex flex-col gap-6">
        <StoredAccountRow
          name={name}
          hue={hue}
          detail="Demo, in this browser only"
          onSwitch={busy ? undefined : onSwitch}
        />
        <div className="flex flex-col gap-4">
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void continueDemo()}>
            Continue demo
            {opening ? (
              <Spinner data-icon="inline-end" />
            ) : (
              <ArrowRightIcon data-icon="inline-end" />
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => void demo.start()}
          >
            {demo.preparing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCcwIcon data-icon="inline-start" />
            )}
            {demo.preparing ? "Preparing your demo…" : "Start a new demo"}
          </Button>
          {openFailed && (
            <FieldError variant="box">
              The demo vault didn&apos;t open. Start a new demo instead.
            </FieldError>
          )}
          {demo.errorMessage && <FieldError variant="box">{demo.errorMessage}</FieldError>}
        </div>
      </CardContent>
    </Card>
  );
}
