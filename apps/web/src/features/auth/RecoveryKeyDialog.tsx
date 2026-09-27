import { wipe } from "@repo/crypto";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { toBase64 } from "@repo/util";
import { type ReactNode, useMemo, useState } from "react";

type RecoveryKeyDialogProps = {
  /** Open while set. Wiped once the user confirms. */
  recoveryKey: Uint8Array | null;
  description?: ReactNode;
  onDone: () => void;
};

/** Shows a freshly issued recovery key once; "I saved it" unlocks after copying. */
export default function RecoveryKeyDialog({
  recoveryKey,
  description = "Store this key in a safe place. It is the only way to recover your vault if you forget your password. It is shown once and never sent to the server.",
  onDone,
}: RecoveryKeyDialogProps) {
  const [copied, setCopied] = useState(false);
  const recoveryKeyB64 = useMemo(() => (recoveryKey ? toBase64(recoveryKey) : ""), [recoveryKey]);

  const onCopy = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKeyB64);
    setCopied(true);
  };

  const onConfirm = () => {
    if (recoveryKey) wipe(recoveryKey);
    setCopied(false);
    onDone();
  };

  return (
    <Dialog
      open={recoveryKey !== null}
      onOpenChange={(open) => {
        if (!open && copied) onConfirm();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save your recovery key</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <code className="select-all break-all rounded bg-muted p-2 font-mono text-xs">
          {recoveryKeyB64}
        </code>
        <DialogFooter>
          <Button variant="secondary" onClick={onCopy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
          <Button onClick={onConfirm} disabled={!copied}>
            I saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
