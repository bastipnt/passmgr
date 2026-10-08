import { zodResolver } from "@hookform/resolvers/zod";
import {
  EXPORT_ERROR_MESSAGES,
  type ExportFormat,
  type ExportRequest,
  type ExportResult,
  useExport,
} from "@repo/client";
import { type ExportPasswordFormValues, exportPasswordFormSchema } from "@repo/schema";
import { toast, useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/Dialog";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Spinner } from "@repo/ui/components/Spinner";
import { DownloadIcon, KeyRoundIcon, LockIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { type Control, type Path, useWatch } from "react-hook-form";
import z from "zod";
import { PasswordStrengthMeter } from "@/features/password-generation";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "encrypted", label: "Encrypted backup (.json)" },
  { value: "json", label: "Unencrypted JSON" },
  { value: "csv", label: "Unencrypted CSV" },
];

const DESCRIPTIONS: Record<ExportFormat, string> = {
  encrypted:
    "Every record in this vault, encrypted with a backup password you choose for the file. Keep it: without it the backup can't be opened.",
  json: "Every record in this vault as plain JSON, for moving to another app.",
  csv: "Every record in this vault as a CSV spreadsheet, for moving to another app.",
};

const plainSchema = z.object({ masterPassword: z.string().min(1, "Enter your master password") });
type PlainFormValues = z.infer<typeof plainSchema>;

/** Hand the file to the browser's download. */
function downloadFile({ fileName, mimeType, content }: ExportResult) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Not right after the click: some browsers (older Safari) cancel a download
  // whose URL is revoked before it started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Export the vault (ADR 0001 D12): an encrypted backup (the backup a local
 * vault relies on), or plain JSON / CSV behind the master password and a
 * warning.
 */
export default function ExportDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("encrypted");
  const { createExport, markSaved, exporting, exportError, clearExportError } = useExport();

  const run = async (request: ExportRequest): Promise<boolean> => {
    const result = await createExport(request);
    if (!result) return false;
    downloadFile(result);
    // The browser can't tell whether the download finished: handing it over counts.
    await markSaved(result);
    if (result.skipped > 0) {
      toast.warning(`${result.skipped} record(s) couldn't be read and are not in the export.`);
    }
    setOpen(false);
    return true;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (exporting) return;
        if (next) {
          clearExportError();
          setFormat("encrypted");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export vault</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[format]}</DialogDescription>
        </DialogHeader>

        <Select
          items={FORMATS}
          value={format}
          onValueChange={(next) => {
            clearExportError();
            setFormat(next as ExportFormat);
          }}
          disabled={exporting}
        >
          <SelectTrigger className="mt-4 w-full" aria-label="Format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {format === "encrypted" ? (
          <EncryptedExportForm
            exporting={exporting}
            error={exportError && EXPORT_ERROR_MESSAGES[exportError]}
            onExport={(masterPassword, exportPassword) =>
              run({ format: "encrypted", masterPassword, exportPassword })
            }
          />
        ) : (
          <PlainExportForm
            exporting={exporting}
            error={exportError && EXPORT_ERROR_MESSAGES[exportError]}
            onExport={(masterPassword) => run({ format, masterPassword })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormProps<Args extends unknown[]> = {
  exporting: boolean;
  error: string | undefined;
  onExport: (...args: Args) => Promise<boolean>;
};

/** Every export asks for it again: an unlocked session alone doesn't take the vault away. */
function MasterPasswordInput<T extends { masterPassword: string }>({
  control,
}: {
  control: Control<T>;
}) {
  return (
    <ControlledPasswordInput
      control={control}
      name={"masterPassword" as Path<T>}
      label="Master password"
      autoComplete="current-password"
      leadingIcon={<LockIcon />}
    />
  );
}

function EncryptedExportForm({
  exporting,
  error,
  onExport,
}: FormProps<[masterPassword: string, exportPassword: string]>) {
  const { handleSubmit, control } = useForm<ExportPasswordFormValues>({
    resolver: zodResolver(exportPasswordFormSchema),
    defaultValues: { masterPassword: "", password: "", confirmPassword: "" },
  });

  return (
    <form
      onSubmit={handleSubmit(({ masterPassword, password }) => onExport(masterPassword, password))}
    >
      <FormLock locked={exporting}>
        <FieldGroup className="my-4 gap-4">
          <MasterPasswordInput control={control} />
          <ControlledPasswordInput
            control={control}
            name="password"
            label="Backup password"
            autoComplete="new-password"
            leadingIcon={<KeyRoundIcon />}
            labelAction={<span className="text-muted-foreground text-xs">min. 8 characters</span>}
            hint={<StrengthHint control={control} />}
          />
          <ControlledPasswordInput
            control={control}
            name="confirmPassword"
            label="Confirm backup password"
            autoComplete="new-password"
            leadingIcon={<KeyRoundIcon />}
          />
          {error && <FieldError variant="box">{error}</FieldError>}
        </FieldGroup>
        <ExportFooter exporting={exporting}>Export backup</ExportFooter>
      </FormLock>
    </form>
  );
}

function PlainExportForm({ exporting, error, onExport }: FormProps<[masterPassword: string]>) {
  const { handleSubmit, control } = useForm<PlainFormValues>({
    resolver: zodResolver(plainSchema),
    defaultValues: { masterPassword: "" },
  });

  return (
    <form onSubmit={handleSubmit(({ masterPassword }) => onExport(masterPassword))}>
      <FormLock locked={exporting}>
        <FieldGroup className="my-4 gap-4">
          <FieldError variant="box">
            This file is not encrypted. Anyone who gets it can read every password in it. Delete it
            once you no longer need it, and don't keep it in synced folders or email.
          </FieldError>
          <MasterPasswordInput control={control} />
          {error && <FieldError variant="box">{error}</FieldError>}
        </FieldGroup>
        <ExportFooter exporting={exporting}>Export unencrypted</ExportFooter>
      </FormLock>
    </form>
  );
}

function ExportFooter({ exporting, children }: { exporting: boolean; children: ReactNode }) {
  return (
    <DialogFooter>
      <DialogClose
        render={
          <Button variant="secondary" disabled={exporting}>
            Cancel
          </Button>
        }
      />
      <Button type="submit" disabled={exporting}>
        {exporting ? <Spinner /> : <DownloadIcon />}
        {children}
      </Button>
    </DialogFooter>
  );
}

function StrengthHint({ control }: { control: Control<ExportPasswordFormValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
