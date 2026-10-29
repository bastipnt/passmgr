import { zodResolver } from "@hookform/resolvers/zod";
import {
  DELETE_EXPORT_FILE_HINT,
  type ForeignImport,
  foreignImportDone,
  foreignImportIntro,
  IMPORT_ERROR_MESSAGES,
  IMPORT_FILE_ACCEPT,
  IMPORT_SOURCE_LABELS,
  type ImportError,
  type ImportResult,
  importStoppedMessage,
  type LockedImportFile,
  leftBehindNotes,
  type OpenedImportFile,
  skippedNote,
  useOpenImportFile,
  useRestoreBackup,
  useStore,
} from "@repo/client";
import { toast, useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent } from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { FileDropZone, type FileDropZoneHandle } from "@repo/ui/components/FileDropZone";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { cn } from "@repo/ui/lib/utils";
import { formatBytes } from "@repo/util";
import {
  ArrowRightIcon,
  CheckIcon,
  FileLockIcon,
  FileUpIcon,
  FileXIcon,
  InfoIcon,
  KeyRoundIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import z from "zod";
import KeyFileButton from "@/components/KeyFileButton";
import { PageMeta } from "@/components/PageMeta";
import { requestPersistentStorage } from "@/hooks/use-storage-durability";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import AuthCardHeader from "./AuthCardHeader";
import AuthChip from "./AuthChip";
import AuthNote from "./AuthNote";
import { useAuthHome } from "./auth-home";
import CreateErrorBox from "./CreateErrorBox";
import NewVaultFields, {
  NEW_VAULT_DEFAULTS,
  type NewVaultValues,
  newVaultSchema,
} from "./NewVaultFields";
import PasswordNote from "./PasswordNote";
import PrivateWindowNote from "./PrivateWindowNote";
import RecoveryKeyDialog from "./RecoveryKeyDialog";
import StepBar from "./StepBar";

const backupPasswordSchema = z.object({ filePassword: z.string().min(1) });
// A KeePass database may have an empty password.
const kdbxPasswordSchema = z.object({ filePassword: z.string() });
type FilePasswordValues = z.infer<typeof kdbxPasswordSchema>;

/** Extra help after `IMPORT_ERROR_MESSAGES` where the restore page has some. */
const ERROR_HINTS: Partial<Record<ImportError, string>> = {
  wrong_password: "It's the one you gave the backup, not your vault password.",
  wrong_kdbx_key: "It's the one you open it with in KeePass, not your vault password.",
};

const recordCount = (opened: OpenedImportFile) =>
  (opened.kind === "foreign" ? opened.foreign.data : opened.data).records.length;

/** Another app's export with nothing in it: no vault to make from it. */
const emptyForeign = (opened: OpenedImportFile | undefined) =>
  opened?.kind === "foreign" && opened.foreign.data.records.length === 0
    ? opened.foreign
    : undefined;

/** A plaintext copy of the passwords that should go once they're in the vault. */
const isPlaintext = (opened: OpenedImportFile) =>
  opened.kind === "foreign" ? !opened.foreign.fileEncrypted : !opened.encrypted;

function toastImported(foreign: ForeignImport, result: ImportResult) {
  const notes = [
    skippedNote(foreign.report),
    ...leftBehindNotes(foreign.report),
    !foreign.fileEncrypted && DELETE_EXPORT_FILE_HINT,
  ].filter((note): note is string => !!note);
  toast.success(foreignImportDone(foreign.source, result.created), {
    description: notes.length > 0 && (
      <span className="flex flex-col gap-1">
        {notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </span>
    ),
    duration: notes.length > 0 ? 20_000 : undefined,
  });
}

/**
 * Start a new vault on this device from a file, next to the vaults already
 * here: restore a backup of this app (ADR 0001 D12) or import another password
 * manager's export. Open the file, then name the vault and pick its password.
 */
export default function RestoreBackupPage() {
  const [, navigate] = useLocation();
  const home = useAuthHome();
  const hasVaults = useStore().profiles.length > 0;
  const persistent = useStoragePersistent();

  const [step, setStep] = useState<"file" | "vault">("file");
  const [opened, setOpened] = useState<OpenedImportFile>();
  const importFile = useOpenImportFile(
    (next) => {
      setOpened(next);
      if (!emptyForeign(next)) setStep("vault");
    },
    { foreign: true },
  );
  const dropZone = useRef<FileDropZoneHandle>(null);

  const { restore, finishRestore, restoreError } = useRestoreBackup();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ recoveryKey: Uint8Array; name: string }>();
  const [restoreTried, setRestoreTried] = useState(false);
  const [pickCount, setPickCount] = useState(0);

  const pickFile = (file: File) => {
    setOpened(undefined);
    setStep("file");
    setRestoreTried(false);
    setPickCount((n) => n + 1);
    void importFile.pick(file);
  };

  const onVaultSubmit = async ({ name, password }: NewVaultValues) => {
    if (!opened) return;
    // The restored vault's only copy lives in OPFS: asked while the submit is a user gesture.
    void requestPersistentStorage();
    setRestoreTried(true);
    setLoading(true);
    try {
      const recoveryKey = await restore(opened, password, name);
      if (recoveryKey) setCreated({ recoveryKey, name });
    } finally {
      setLoading(false);
    }
  };

  const back = step === "file" ? () => navigate(home) : created ? undefined : () => setStep("file");
  const { file, error, locked } = importFile;
  const unopenable = error !== undefined && !locked;
  const empty = emptyForeign(opened);

  return (
    <>
      <PageMeta title="Restore or import" noindex />
      <RecoveryKeyDialog
        recoveryKey={created?.recoveryKey ?? null}
        name={created?.name || undefined}
        onDone={() => {
          setCreated(undefined);
          const source = opened;
          // Unlocking leaves the auth routes on its own; the import runs on after that.
          void finishRestore().then((outcome) => {
            if (source?.kind === "foreign") {
              if (outcome.ok) toastImported(source.foreign, outcome.result);
              else
                toast.error(
                  `Your vault was created, but the import into it failed. ${
                    (outcome.stopped && importStoppedMessage(outcome.stopped)) ??
                    "Import the file again under Settings → Security."
                  }`,
                );
            } else if (outcome.ok)
              toast.success(`Backup restored: ${outcome.result.created} record(s).`);
            else
              toast.error(
                "Your vault was created, but the backup couldn't be restored into it. Import the file again under Settings → Security.",
              );
          });
        }}
      />

      <div className="flex w-full flex-col sm:col-span-full sm:mx-auto sm:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar
            onBack={back}
            step={step === "file" ? 1 : 2}
            disabled={loading || importFile.opening}
          />

          <div hidden={step !== "file"} className="flex flex-col gap-6">
            <AuthCardHeader
              title="Restore or import"
              description={
                hasVaults
                  ? "Open a passmgr backup or another password manager's export. It becomes a new vault on this device, next to the ones already here."
                  : "Open a passmgr backup or another password manager's export. It becomes a new vault on this device."
              }
            />
            <CardContent className="flex flex-col gap-5">
              <FileDropZone
                ref={dropZone}
                onFile={pickFile}
                accept={IMPORT_FILE_ACCEPT}
                label="Backup or export file"
                icon={<FileUpIcon />}
                title="Choose a file"
                hint="or drop it here · passmgr backup, CSV, JSON, 1PUX, KeePass"
                className={cn(file && "hidden")}
              />
              {file && (
                <AuthChip
                  icon={unopenable ? <FileXIcon /> : <FileLockIcon />}
                  tone={unopenable ? "error" : "neutral"}
                  title={file.name}
                  detail={
                    unopenable
                      ? "Can't be opened"
                      : locked === "backup"
                        ? `Encrypted backup · ${formatBytes(file.size)}`
                        : locked === "kdbx"
                          ? `KeePass database · ${formatBytes(file.size)}`
                          : formatBytes(file.size)
                  }
                  onChange={() => dropZone.current?.open()}
                  disabled={importFile.opening}
                />
              )}

              {locked ? (
                <FilePasswordForm
                  key={pickCount}
                  locked={locked}
                  onSubmit={(password, keyFile) => importFile.open(password, keyFile)}
                  opening={importFile.opening}
                  error={error && <OpenErrorBox error={error} />}
                />
              ) : (
                <>
                  {error && <OpenErrorBox error={error} />}
                  {opened && !empty && (
                    <Button
                      type="button"
                      size="lg"
                      className="w-full"
                      onClick={() => setStep("vault")}
                    >
                      Continue
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  )}
                </>
              )}
              {empty && (
                <AuthNote icon={<InfoIcon className="text-primary-text" />}>
                  {foreignImportIntro(empty)}
                </AuthNote>
              )}
              <PasswordNote>The file is opened on this device only</PasswordNote>
            </CardContent>
          </div>

          {opened && !empty && (
            <VaultStep
              key={pickCount}
              visible={step === "vault"}
              opened={opened}
              fileName={file?.name ?? ""}
              onChangeFile={() => dropZone.current?.open()}
              onSubmit={onVaultSubmit}
              loading={loading || created !== undefined}
              note={
                persistent === false && (
                  <PrivateWindowNote>
                    <strong className="font-semibold">
                      This browser can&apos;t keep your vault
                    </strong>{" "}
                    (private window?). The new vault is gone once you close this tab. Keep the file.
                  </PrivateWindowNote>
                )
              }
              error={
                restoreTried &&
                (restoreError === "failed" || restoreError === "unlock_failed") && (
                  <CreateErrorBox
                    error={restoreError}
                    afterUnlock=" and import the file under Settings → Security."
                  />
                )
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}

function OpenErrorBox({ error }: { error: ImportError }) {
  const hint = ERROR_HINTS[error];
  return (
    <FieldError variant="box">
      {hint ? (
        <span>
          <strong className="font-semibold">{IMPORT_ERROR_MESSAGES[error]}</strong> {hint}
        </span>
      ) : (
        IMPORT_ERROR_MESSAGES[error]
      )}
    </FieldError>
  );
}

function FilePasswordForm({
  locked,
  onSubmit,
  opening,
  error,
}: {
  locked: LockedImportFile;
  onSubmit: (password: string, keyFile?: Uint8Array) => Promise<void>;
  opening: boolean;
  error: ReactNode;
}) {
  const kdbx = locked === "kdbx";
  const [keyFile, setKeyFile] = useState<{ name: string; bytes: Uint8Array }>();
  const { handleSubmit, control, setFocus } = useForm<FilePasswordValues>({
    resolver: zodResolver(kdbx ? kdbxPasswordSchema : backupPasswordSchema),
    defaultValues: { filePassword: "" },
  });

  useEffect(() => setFocus("filePassword"), [setFocus]);

  return (
    <form onSubmit={handleSubmit(({ filePassword }) => onSubmit(filePassword, keyFile?.bytes))}>
      <FormLock locked={opening}>
        <FieldGroup className="gap-5">
          <ControlledPasswordInput
            control={control}
            name="filePassword"
            label={kdbx ? "Database password" : "Backup password"}
            autoComplete="off"
            leadingIcon={<KeyRoundIcon />}
            hint={
              !error && (
                <p className="text-muted-foreground text-xs">
                  {kdbx
                    ? "The password you open the database with in KeePass."
                    : "The password you gave the backup when you exported it."}
                </p>
              )
            }
          />
          {kdbx && <KeyFileButton keyFile={keyFile} onKeyFile={setKeyFile} disabled={opening} />}
          {error}
          <Button type="submit" size="lg" className="w-full" disabled={opening}>
            Continue
            {opening ? (
              <Spinner data-icon="inline-end" />
            ) : (
              <ArrowRightIcon data-icon="inline-end" />
            )}
          </Button>
        </FieldGroup>
      </FormLock>
    </form>
  );
}

function VaultStep({
  visible,
  opened,
  fileName,
  onChangeFile,
  onSubmit,
  loading,
  note,
  error,
}: {
  /** Hidden, not unmounted, on Back: the typed name and password stay. */
  visible: boolean;
  opened: OpenedImportFile;
  fileName: string;
  onChangeFile: () => void;
  onSubmit: (values: NewVaultValues) => Promise<void>;
  loading: boolean;
  note: ReactNode;
  error: ReactNode;
}) {
  const { handleSubmit, control, setValue } = useForm<NewVaultValues>({
    resolver: zodResolver(newVaultSchema),
    defaultValues: NEW_VAULT_DEFAULTS,
  });

  const foreign = opened.kind === "foreign" ? opened.foreign : undefined;
  const count = recordCount(opened);

  return (
    <div hidden={!visible} className="flex flex-col gap-6">
      <AuthCardHeader
        title="Set up the vault"
        description={
          foreign
            ? `Choose a password for the new vault. Everything from ${IMPORT_SOURCE_LABELS[foreign.source]} goes into it, and you'll get a recovery key for it.`
            : "Choose a password for the restored vault. You'll get a new recovery key for it."
        }
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={loading}>
            <FieldGroup className="gap-5">
              <AuthChip
                icon={<CheckIcon />}
                tone="success"
                title={
                  foreign
                    ? `${count} item(s) ready to import`
                    : `${count} record(s) ready to restore`
                }
                detail={
                  opened.kind === "foreign"
                    ? `${IMPORT_SOURCE_LABELS[opened.foreign.source]} ${opened.foreign.fileEncrypted ? "database" : "export"} · ${fileName}`
                    : opened.encrypted
                      ? fileName
                      : "Plain JSON export · not encrypted"
                }
                onChange={onChangeFile}
                disabled={loading}
              />
              {isPlaintext(opened) && (
                <AuthNote icon={<Trash2Icon className="text-muted-foreground" />}>
                  <strong className="font-semibold">This file isn&apos;t encrypted.</strong> Anyone
                  who can read it can read your passwords: delete it once the vault is set up.
                </AuthNote>
              )}
              {note}
              <NewVaultFields control={control} setValue={setValue} />
              {error}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {foreign ? "Create vault & import" : "Restore vault"}
                {loading ? (
                  <Spinner data-icon="inline-end" />
                ) : (
                  <ArrowRightIcon data-icon="inline-end" />
                )}
              </Button>
              <PasswordNote />
            </FieldGroup>
          </FormLock>
        </form>
      </CardContent>
    </div>
  );
}
