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
import { cn } from "@repo/ui/lib/utils";
import { toBase64 } from "@repo/util";
import { ArrowRightIcon, CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

// Color-coded chunks make the key easier to transcribe and compare.
const CHUNK_COLOR = [
  "text-[#b45f00] dark:text-[#ffd08a]",
  "text-[#c8175e] dark:text-[#ff8db8]",
  "text-[#0677ab] dark:text-[#9adfff]",
  "text-[#5b3df0] dark:text-[#c3b4ff]",
];

function chunk(value: string, parts: number): string[] {
  const size = Math.ceil(value.length / parts);
  return Array.from({ length: parts }, (_, i) => value.slice(i * size, (i + 1) * size)).filter(
    Boolean,
  );
}

type RecoveryKeyDialogProps = {
  /** Open while set. Wiped once the user confirms. */
  recoveryKey: Uint8Array | null;
  description?: ReactNode;
  onDone: () => void;
};

/** Shows a freshly issued recovery key once; "I saved it" unlocks after copying. */
export default function RecoveryKeyDialog({
  recoveryKey,
  description = (
    <>
      Store this key in a safe place. It is the{" "}
      <strong className="font-semibold text-foreground">only way to recover your vault</strong> if
      you forget your password. It is shown once and never sent to the server.
    </>
  ),
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
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader className="gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <KeyRoundIcon className="size-5" aria-hidden />
          </span>
          <DialogTitle>Save your recovery key</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Inline chunks with no whitespace between them, so selecting or reading the
            element yields the exact key (grid/flex items would copy with newlines). */}
        <code className="block select-all break-all rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4 font-medium font-mono text-sm dark:border-white/10 dark:bg-black/30">
          {chunk(recoveryKeyB64, 4).map((part, i) => (
            <span
              key={i}
              className={cn("inline-block w-1/2 py-0.5", CHUNK_COLOR[i % CHUNK_COLOR.length])}
            >
              {part}
            </span>
          ))}
        </code>

        {copied && (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="grid size-4 place-items-center rounded bg-primary text-primary-foreground">
              <CheckIcon className="size-3" aria-hidden />
            </span>
            Copied to clipboard — paste it into a safe place
          </p>
        )}

        <DialogFooter className="sm:grid sm:grid-cols-2">
          <Button variant="outline" size="lg" onClick={onCopy} aria-label="Copy to clipboard">
            {copied ? (
              <CheckIcon data-icon="inline-start" className="text-success" />
            ) : (
              <CopyIcon data-icon="inline-start" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="lg" onClick={onConfirm} disabled={!copied}>
            I saved it
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
