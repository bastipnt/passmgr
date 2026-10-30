import {
  DELETE_EXPORT_FILE_HINT,
  type DuplicateStrategy,
  defaultVaultMap,
  type ForeignImport,
  type ForeignImportReport,
  foreignImportDone,
  foreignImportIntro,
  IMPORT_ERROR_MESSAGES,
  type ImportResult,
  type ImportSource,
  importStoppedMessage,
  leftBehindNotes,
  SKIP_REASON_LABELS,
  useImport,
  useStore,
  writableVaults,
} from "@repo/client";
import type { ExportData, MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { toast } from "@repo/ui";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Spinner } from "@repo/ui/components/Spinner";
import { TriangleAlertIcon, UploadIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import OpenBackupForm from "@/components/OpenBackupForm";

const DUPLICATES: { value: DuplicateStrategy; label: string }[] = [
  { value: "skip", label: "Skip them" },
  { value: "overwrite", label: "Overwrite (old version stays in the history)" },
  { value: "keep-both", label: "Keep both" },
];

type TargetVault = { id: string; name: string };

function vaultName(vault: MemberVault): string {
  try {
    return secretsStore.decryptVaultMeta(vault).name;
  } catch {
    return vault.kind === "personal" ? "Personal" : "Vault";
  }
}

function summary({ created, updated, skipped }: ImportResult): string {
  const parts = [`${created} added`];
  if (updated > 0) parts.push(`${updated} updated`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `Import done: ${parts.join(", ")}.`;
}

type Step =
  | { kind: "backup"; data: ExportData }
  | { kind: "foreign"; foreign: ForeignImport }
  // The records aren't kept past the import, only what the result shows.
  | {
      kind: "foreignDone";
      source: ImportSource;
      report: ForeignImportReport;
      result: ImportResult | null;
      fileEncrypted?: boolean;
    };

/**
 * Import into the open vault: this app's export (ADR 0001 D12, an encrypted
 * backup or plain JSON) or another password manager's. A backup's records go
 * into the vault they came from when it's here (and writable), else into the
 * personal vault; with more than one writable vault the user picks per file
 * vault. Another app's records all go into one vault the user picks.
 */
export default function ImportDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>();
  const importer = useImport();
  const { busy } = importer;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
      }}
      // The file's records are plaintext: not kept once the dialog is gone
      // (after the close animation, so the content doesn't jump while it fades).
      onOpenChangeComplete={(next) => {
        if (!next) setStep(undefined);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            Add the records of a backup of this app, or of another password manager's export, to
            this vault.
          </DialogDescription>
        </DialogHeader>
        {!step && (
          <OpenBackupForm
            onOpened={(data) => setStep({ kind: "backup", data })}
            onForeignOpened={(foreign) => setStep({ kind: "foreign", foreign })}
            renderActions={(submit) => <Footer>{submit}</Footer>}
          />
        )}
        {step?.kind === "backup" && (
          <ImportOptionsForm data={step.data} importer={importer} onDone={() => setOpen(false)} />
        )}
        {step?.kind === "foreign" && (
          <ForeignImportForm
            foreign={step.foreign}
            importer={importer}
            onDone={(result) =>
              setStep({
                kind: "foreignDone",
                source: step.foreign.source,
                report: step.foreign.report,
                result,
                fileEncrypted: step.foreign.fileEncrypted,
              })
            }
          />
        )}
        {step?.kind === "foreignDone" && (
          <ForeignImportResult
            source={step.source}
            report={step.report}
            result={step.result}
            fileEncrypted={step.fileEncrypted}
            importer={importer}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Footer({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <DialogFooter>
      <DialogClose
        render={
          <Button variant="secondary" disabled={busy}>
            Cancel
          </Button>
        }
      />
      {children}
    </DialogFooter>
  );
}

type ImportOptionsFormProps = {
  data: ExportData;
  importer: ReturnType<typeof useImport>;
  onDone: () => void;
};

/** The vaults an import can write to, with their names; `undefined` while loading. */
function useTargetVaults(onLoaded?: (vaults: MemberVault[], fallbackVaultId: string) => void) {
  const { current } = useStore();
  const [targets, setTargets] = useState<TargetVault[]>();
  const fallbackVaultId = secretsStore.defaultVaultId;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const active = current();
    if (!active || !fallbackVaultId) return;
    let cancelled = false;
    void active.vault.getVaults().then((vaults) => {
      if (cancelled) return;
      setTargets(writableVaults(vaults).map((v) => ({ id: v.vaultId, name: vaultName(v) })));
      onLoadedRef.current?.(vaults, fallbackVaultId);
    });
    return () => {
      cancelled = true;
    };
  }, [current, fallbackVaultId]);

  return { targets, fallbackVaultId };
}

function ImportOptionsForm({ data, importer, onDone }: ImportOptionsFormProps) {
  const { importData, busy, importError } = importer;
  const [vaultMap, setVaultMap] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateStrategy>("skip");
  const { targets, fallbackVaultId } = useTargetVaults((vaults, fallback) =>
    setVaultMap(defaultVaultMap(data.vaults, vaults, fallback)),
  );

  async function run(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fallbackVaultId) return;
    const result = await importData(data, { vaultMap, fallbackVaultId, duplicates });
    if (!result) return;
    toast.success(summary(result));
    onDone();
  }

  const fileVaults = data.vaults.filter((v) => data.records.some((r) => r.vaultId === v.id));

  return (
    <form onSubmit={run}>
      <FieldGroup className="my-4 gap-4">
        <p className="text-sm">
          {data.records.length} record(s) from{" "}
          {new Date(data.exportedAt).toLocaleDateString("en", { dateStyle: "medium" })}.
        </p>

        {targets && targets.length > 1 && (
          <FieldGroup className="gap-3">
            {fileVaults.map((fileVault) => (
              <ChoiceField
                key={fileVault.id}
                label={`“${fileVault.name}” goes to`}
                items={targets.map((t) => ({ value: t.id, label: t.name }))}
                value={vaultMap[fileVault.id] ?? fallbackVaultId ?? ""}
                disabled={busy}
                onChange={(id) => setVaultMap((map) => ({ ...map, [fileVault.id]: id }))}
              />
            ))}
          </FieldGroup>
        )}

        <ChoiceField
          label="Records already in this vault (or deleted from it)"
          items={DUPLICATES}
          value={duplicates}
          disabled={busy}
          onChange={(value) => setDuplicates(value as DuplicateStrategy)}
        />

        {importError && <FieldError variant="box">{IMPORT_ERROR_MESSAGES[importError]}</FieldError>}
      </FieldGroup>
      <Footer busy={busy}>
        <Button type="submit" disabled={busy || !targets}>
          {busy ? <Spinner /> : <UploadIcon />}
          Import
        </Button>
      </Footer>
    </form>
  );
}

type ForeignImportFormProps = {
  foreign: ForeignImport;
  importer: ReturnType<typeof useImport>;
  onDone: (result: ImportResult | null) => void;
};

/** Another app's export: every record is new, all into one vault. */
function ForeignImportForm({ foreign, importer, onDone }: ForeignImportFormProps) {
  const { importData, busy } = importer;
  const { targets, fallbackVaultId } = useTargetVaults();
  const [vaultId, setVaultId] = useState<string>();
  const target = vaultId ?? fallbackVaultId;
  const { records } = foreign.data;

  async function run(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    onDone(
      await importData(foreign.data, {
        vaultMap: { [foreign.vaultId]: target },
        fallbackVaultId: target,
        duplicates: "keep-both",
      }),
    );
  }

  return (
    <form onSubmit={run}>
      <FieldGroup className="my-4 gap-4">
        <p className="text-sm">{foreignImportIntro(foreign)}</p>
        {targets && targets.length > 1 && (
          <ChoiceField
            label="Import into"
            items={targets.map((t) => ({ value: t.id, label: t.name }))}
            value={target ?? ""}
            disabled={busy}
            onChange={setVaultId}
          />
        )}
      </FieldGroup>
      <Footer busy={busy}>
        <Button type="submit" disabled={busy || !targets || records.length === 0}>
          {busy ? <Spinner /> : <UploadIcon />}
          Import
        </Button>
      </Footer>
    </form>
  );
}

type ForeignImportResultProps = {
  source: ImportSource;
  report: ForeignImportReport;
  result: ImportResult | null;
  fileEncrypted?: boolean;
  importer: ReturnType<typeof useImport>;
};

/** What an import from another app did and didn't bring over; a plaintext file: delete it. */
function ForeignImportResult({
  source,
  report,
  result,
  fileEncrypted,
  importer,
}: ForeignImportResultProps) {
  const { stopped, importError } = importer;
  const { skipped } = report;
  const notes = leftBehindNotes(report);

  return (
    <div className="my-4 flex flex-col gap-4 text-sm">
      {result ? (
        <p>{foreignImportDone(source, result.created)}</p>
      ) : (
        <FieldError variant="box">
          {(stopped && importStoppedMessage(stopped)) ??
            IMPORT_ERROR_MESSAGES[importError ?? "failed"]}
        </FieldError>
      )}
      {skipped.length > 0 && (
        <div>
          <p className="font-medium">Not imported ({skipped.length})</p>
          <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-muted-foreground">
            {skipped.map((item, i) => (
              <li key={i}>
                {item.title}: {SKIP_REASON_LABELS[item.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.map((note) => (
        <p key={note} className="text-muted-foreground">
          {note}
        </p>
      ))}
      {!fileEncrypted && (
        <p className="flex gap-2 rounded-md bg-muted p-3">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {DELETE_EXPORT_FILE_HINT}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button>Done</Button>} />
      </DialogFooter>
    </div>
  );
}

function ChoiceField({
  label,
  items,
  value,
  disabled,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => onChange(next as string)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
