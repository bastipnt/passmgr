import {
  type DuplicateStrategy,
  defaultVaultMap,
  IMPORT_ERROR_MESSAGES,
  type ImportResult,
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
import { UploadIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
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

/**
 * Import an export into the open vault (ADR 0001 D12): an encrypted backup or
 * plain JSON. Records go into the vault they came from when it's here (and
 * writable), else into the personal vault; with more than one writable vault
 * the user picks per file vault.
 */
export default function ImportDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExportData>();
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
        if (!next) setData(undefined);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            Add the records of a backup or a JSON export of this app to this vault.
          </DialogDescription>
        </DialogHeader>
        {data ? (
          <ImportOptionsForm data={data} importer={importer} onDone={() => setOpen(false)} />
        ) : (
          <OpenBackupForm
            onOpened={setData}
            renderActions={(submit) => <Footer>{submit}</Footer>}
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

function ImportOptionsForm({ data, importer, onDone }: ImportOptionsFormProps) {
  const { current } = useStore();
  const { importData, busy, importError } = importer;
  const [targets, setTargets] = useState<TargetVault[]>();
  const [vaultMap, setVaultMap] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateStrategy>("skip");
  const fallbackVaultId = secretsStore.defaultVaultId;

  useEffect(() => {
    const active = current();
    if (!active || !fallbackVaultId) return;
    let cancelled = false;
    void active.vault.getVaults().then((vaults) => {
      if (cancelled) return;
      setTargets(writableVaults(vaults).map((v) => ({ id: v.vaultId, name: vaultName(v) })));
      setVaultMap(defaultVaultMap(data.vaults, vaults, fallbackVaultId));
    });
    return () => {
      cancelled = true;
    };
  }, [current, data, fallbackVaultId]);

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
