import { zodResolver } from "@hookform/resolvers/zod";
import {
  IMPORT_ERROR_MESSAGES,
  type ImportError,
  type OpenedBackup,
  useOpenBackupFile,
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
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { requestPersistentStorage } from "@/hooks/use-storage-durability";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import AuthCardHeader from "./AuthCardHeader";
import AuthChip from "./AuthChip";
import AuthNote from "./AuthNote";
import AuthTextLink from "./AuthTextLink";
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

const backupPasswordSchema = z.object({ backupPassword: z.string().min(1) });
type BackupPasswordValues = z.infer<typeof backupPasswordSchema>;

/** Extra help after `IMPORT_ERROR_MESSAGES` where the restore page has some. */
const ERROR_HINTS: Partial<Record<ImportError, string>> = {
  wrong_password: "It's the one you gave the backup, not your vault password.",
  invalid_file: "Choose the .json file you exported from passmgr.",
};

/**
 * Restore a backup into a new vault on this device (ADR 0001 D12), next to
 * the vaults already here: open the file, then name the vault and pick its password.
 */
export default function RestoreBackupPage() {
  const [, navigate] = useLocation();
  const home = useAuthHome();
  const hasVaults = useStore().profiles.length > 0;
  const persistent = useStoragePersistent();

  const [step, setStep] = useState<"file" | "vault">("file");
  const [backup, setBackup] = useState<OpenedBackup>();
  const backupFile = useOpenBackupFile((opened) => {
    setBackup(opened);
    setStep("vault");
  });
  const dropZone = useRef<FileDropZoneHandle>(null);

  const { restore, finishRestore, restoreError } = useRestoreBackup();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ recoveryKey: Uint8Array; name: string }>();
  const [restoreTried, setRestoreTried] = useState(false);
  const [pickCount, setPickCount] = useState(0);

  const pickFile = (file: File) => {
    setBackup(undefined);
    setStep("file");
    setRestoreTried(false);
    setPickCount((n) => n + 1);
    void backupFile.pick(file);
  };

  const onVaultSubmit = async ({ name, password }: NewVaultValues) => {
    if (!backup) return;
    // The restored vault's only copy lives in OPFS: asked while the submit is a user gesture.
    void requestPersistentStorage();
    setRestoreTried(true);
    setLoading(true);
    try {
      const recoveryKey = await restore(backup.data, password, name);
      if (recoveryKey) setCreated({ recoveryKey, name });
    } finally {
      setLoading(false);
    }
  };

  const back = step === "file" ? () => navigate(home) : created ? undefined : () => setStep("file");
  const { file, error } = backupFile;
  const unopenable = error !== undefined && !backupFile.encrypted;

  return (
    <>
      <PageMeta title="Restore a backup" noindex />
      <RecoveryKeyDialog
        recoveryKey={created?.recoveryKey ?? null}
        name={created?.name || undefined}
        onDone={() => {
          setCreated(undefined);
          // Unlocking leaves the auth routes on its own; the import runs on after that.
          void finishRestore().then((result) => {
            if (result) toast.success(`Backup restored: ${result.created} record(s).`);
            else
              toast.error(
                "Your vault was created, but the backup couldn't be restored into it. Import the file again under Settings → Security.",
              );
          });
        }}
      />

      <div className="flex w-full flex-col lg:col-span-full lg:mx-auto lg:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar
            onBack={back}
            step={step === "file" ? 1 : 2}
            disabled={loading || backupFile.opening}
          />

          <div hidden={step !== "file"} className="flex flex-col gap-6">
            <AuthCardHeader
              title="Restore a backup"
              description={
                hasVaults
                  ? "Open a backup you exported from passmgr. It becomes a new vault on this device, next to the ones already here."
                  : "Open a backup you exported from passmgr. It becomes a new vault on this device."
              }
            />
            <CardContent className="flex flex-col gap-5">
              <FileDropZone
                ref={dropZone}
                onFile={pickFile}
                accept=".json,application/json"
                label="Backup file"
                icon={<FileUpIcon />}
                title="Choose a backup file"
                hint="or drop it here · .json"
                className={cn(file && "hidden")}
              />
              {file && (
                <AuthChip
                  icon={unopenable ? <FileXIcon /> : <FileLockIcon />}
                  tone={unopenable ? "error" : "neutral"}
                  title={file.name}
                  detail={
                    unopenable
                      ? "Can't be restored"
                      : backupFile.encrypted
                        ? `Encrypted backup · ${formatBytes(file.size)}`
                        : formatBytes(file.size)
                  }
                  onChange={() => dropZone.current?.open()}
                  disabled={backupFile.opening}
                />
              )}

              {backupFile.encrypted ? (
                <BackupPasswordForm
                  key={pickCount}
                  onSubmit={({ backupPassword }) => backupFile.open(backupPassword)}
                  opening={backupFile.opening}
                  error={error && <OpenErrorBox error={error} />}
                />
              ) : (
                <>
                  {error && <OpenErrorBox error={error} />}
                  {backup && (
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
                  {(!file || error) && (
                    <AuthNote icon={<InfoIcon className="text-primary" />}>
                      <strong className="font-semibold">
                        Coming from another password manager?
                      </strong>{" "}
                      <AuthTextLink href={authPaths.create}>Create a vault</AuthTextLink> first,
                      then import under Settings → Security.
                    </AuthNote>
                  )}
                </>
              )}
              <PasswordNote>The file is opened on this device only</PasswordNote>
            </CardContent>
          </div>

          {backup && (
            <VaultStep
              key={pickCount}
              visible={step === "vault"}
              backup={backup}
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
                    (private window?). The restored vault is gone once you close this tab. Keep the
                    backup file.
                  </PrivateWindowNote>
                )
              }
              error={
                restoreTried &&
                (restoreError === "failed" || restoreError === "unlock_failed") && (
                  <CreateErrorBox
                    error={restoreError}
                    afterUnlock=" and import the backup under Settings → Security."
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

function BackupPasswordForm({
  onSubmit,
  opening,
  error,
}: {
  onSubmit: (values: BackupPasswordValues) => Promise<void>;
  opening: boolean;
  error: ReactNode;
}) {
  const { handleSubmit, control, setFocus } = useForm<BackupPasswordValues>({
    resolver: zodResolver(backupPasswordSchema),
    defaultValues: { backupPassword: "" },
  });

  useEffect(() => setFocus("backupPassword"), [setFocus]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormLock locked={opening}>
        <FieldGroup className="gap-5">
          <ControlledPasswordInput
            control={control}
            name="backupPassword"
            label="Backup password"
            autoComplete="off"
            leadingIcon={<KeyRoundIcon />}
            hint={
              !error && (
                <p className="text-muted-foreground text-xs">
                  The password you gave the backup when you exported it.
                </p>
              )
            }
          />
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
  backup,
  fileName,
  onChangeFile,
  onSubmit,
  loading,
  note,
  error,
}: {
  /** Hidden, not unmounted, on Back: the typed name and password stay. */
  visible: boolean;
  backup: OpenedBackup;
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

  return (
    <div hidden={!visible} className="flex flex-col gap-6">
      <AuthCardHeader
        title="Set up the vault"
        description="Choose a password for the restored vault. You'll get a new recovery key for it."
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={loading}>
            <FieldGroup className="gap-5">
              <AuthChip
                icon={<CheckIcon />}
                tone="success"
                title={`${backup.data.records.length} record(s) ready to restore`}
                detail={backup.encrypted ? fileName : "Plain JSON export · not encrypted"}
                onChange={onChangeFile}
                disabled={loading}
              />
              {!backup.encrypted && (
                <AuthNote icon={<Trash2Icon className="text-muted-foreground" />}>
                  <strong className="font-semibold">This file isn&apos;t encrypted.</strong> Anyone
                  who can read it can read your passwords: delete it once the vault is restored.
                </AuthNote>
              )}
              {note}
              <NewVaultFields control={control} setValue={setValue} />
              {error}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                Restore vault
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
