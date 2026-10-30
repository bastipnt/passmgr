import { zodResolver } from "@hookform/resolvers/zod";
import {
  qrCodePath,
  type TotpEnrollment,
  TWO_FACTOR_ERROR_MESSAGES,
  useTwoFactor,
} from "@repo/client";
import { type TotpConfirmFormValues, totpConfirmFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import BackupCodes from "./BackupCodes";
import TwoFactorPasswordForm from "./TwoFactorPasswordForm";

/** Quiet zone around the code, in modules; scanners want at least 4. */
const QUIET_ZONE = 4;

type Step =
  | { kind: "password" }
  | { kind: "scan"; enrollment: TotpEnrollment }
  | { kind: "codes"; codes: string[] };

/** "ABCD EFGH …": easier to type into an app by hand. */
const groupSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

function EnrollmentQr({ uri }: { uri: string }) {
  const qr = useMemo(() => qrCodePath(uri), [uri]);
  const box = qr.size + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      className="mx-auto size-48 rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      <title>QR code for your authenticator app</title>
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

function ScanStep({
  enrollment,
  onConfirmed,
}: {
  enrollment: TotpEnrollment;
  onConfirmed: (codes: string[]) => void;
}) {
  const { confirm, error, pending } = useTwoFactor();
  const [copied, setCopied] = useState(false);
  const { handleSubmit, control } = useForm<TotpConfirmFormValues>({
    resolver: zodResolver(totpConfirmFormSchema),
    defaultValues: { code: "" },
  });

  const onSubmit = async ({ code }: TotpConfirmFormValues) => {
    const codes = await confirm(code);
    if (codes) onConfirmed(codes);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormLock locked={pending}>
        <FieldGroup className="my-4 gap-4">
          <EnrollmentQr uri={enrollment.uri} />
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-sm">Or enter this setup key:</span>
            <code
              aria-label="Setup key"
              data-secret={enrollment.secret}
              className="block select-all break-all rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 font-medium font-mono text-sm dark:border-white/10 dark:bg-black/30"
            >
              {groupSecret(enrollment.secret)}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void navigator.clipboard.writeText(enrollment.secret).then(() => setCopied(true))
                }
              >
                {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
                {copied ? "Copied" : "Copy key"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={enrollment.uri} aria-label="Open in authenticator app" />}
              >
                <ExternalLinkIcon />
                Open in app
              </Button>
            </div>
          </div>
          <ControlledInput
            control={control}
            name="code"
            label="Code from the app"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456"
            leadingIcon={<ShieldCheckIcon />}
          />
          {error && <FieldError variant="box">{TWO_FACTOR_ERROR_MESSAGES[error]}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <ArrowRightIcon />}
            Turn on
          </Button>
        </DialogFooter>
      </FormLock>
    </form>
  );
}

/**
 * Turn two-factor on: the master password (a fresh login), the secret into
 * the authenticator app (QR code, key or link), its first code, then the
 * backup codes, shown once. Controlled: it stays mounted while the status
 * flips to "on" under it, so the backup codes still show.
 */
export default function EnableTwoFactorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [saved, setSaved] = useState(false);
  const { startEnrollment, error, clearError, pending } = useTwoFactor();

  const onPassword = async (password: string) => {
    const enrollment = await startEnrollment(password);
    if (enrollment) setStep({ kind: "scan", enrollment });
  };

  // The backup codes are shown once: no closing before they're saved.
  const closable = step.kind !== "codes" || saved;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending || (!next && !closable)) return;
        if (next) {
          clearError();
          setStep({ kind: "password" });
          setSaved(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={closable}>
        <DialogHeader>
          <DialogTitle>
            {step.kind === "codes" ? "Save your backup codes" : "Turn on two-factor"}
          </DialogTitle>
          <DialogDescription>
            {step.kind === "password" &&
              "Signing in to your account will also ask for a code from an authenticator app. Enter your password to start."}
            {step.kind === "scan" &&
              "Scan the QR code with your authenticator app, then enter the code it shows. Keep this account's codes in an app outside this vault: they're needed to get back in."}
            {step.kind === "codes" &&
              "Each code signs you in once if you lose your authenticator. They're shown only now: save them somewhere safe, outside this vault."}
          </DialogDescription>
        </DialogHeader>

        {step.kind === "password" && (
          <TwoFactorPasswordForm
            onSubmit={onPassword}
            error={error}
            pending={pending}
            submitLabel="Continue"
            icon={<ArrowRightIcon />}
          />
        )}
        {step.kind === "scan" && (
          <ScanStep
            enrollment={step.enrollment}
            onConfirmed={(codes) => setStep({ kind: "codes", codes })}
          />
        )}
        {step.kind === "codes" && (
          <>
            <BackupCodes codes={step.codes} onSaved={() => setSaved(true)} />
            <DialogFooter>
              <Button disabled={!saved} onClick={() => onOpenChange(false)}>
                I saved them
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
