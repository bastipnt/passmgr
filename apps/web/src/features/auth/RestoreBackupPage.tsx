import { zodResolver } from "@hookform/resolvers/zod";
import { useRestoreBackup } from "@repo/client";
import type { ExportData } from "@repo/schema";
import { toast, useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, LockIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import OpenBackupForm from "@/components/OpenBackupForm";
import { PageMeta } from "@/components/PageMeta";
import { PasswordStrengthMeter } from "@/features/password-generation";
import { requestPersistentStorage } from "@/hooks/use-storage-durability";
import { AuthHero, HeroAccent, HeroSteps } from "./AuthHero";
import AuthTextLink from "./AuthTextLink";
import RecoveryKeyDialog from "./RecoveryKeyDialog";

const RESTORE_STEPS = [
  {
    title: "Open your backup",
    description: "An encrypted backup asks for the password you gave it.",
  },
  {
    title: "Pick a master password",
    description: "The restored vault gets its own, and a new recovery key.",
  },
  {
    title: "Back where you were",
    description: "Every record of the backup, stored encrypted on this device.",
  },
];

const restoreSchema = z
  .object({
    name: z.string().max(60),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof restoreSchema>;

/**
 * Restore a backup into a new vault on this device (ADR 0001 D12): for a
 * cleared browser or a new device. Added next to the profiles already here.
 */
export default function RestoreBackupPage() {
  const [data, setData] = useState<ExportData>();

  return (
    <>
      <PageMeta title="Restore a backup" noindex />
      <AuthHero
        title={
          <>
            Lost your browser data? <HeroAccent>Restore</HeroAccent> your vault.
          </>
        }
      >
        <HeroSteps steps={RESTORE_STEPS} />
      </AuthHero>

      <Card variant="glass">
        <CardHeader>
          <CardTitle>Restore a backup</CardTitle>
          <CardDescription>
            {data ? (
              <>
                {data.records.length} record(s) found.{" "}
                <button
                  type="button"
                  className="rounded-sm font-semibold text-foreground underline decoration-1 decoration-foreground/40 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
                  onClick={() => setData(undefined)}
                >
                  Choose another file
                </button>
              </>
            ) : (
              <>
                No backup? <AuthTextLink href={authPaths.createLocal}>Start fresh</AuthTextLink>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <NewVaultForm data={data} />
          ) : (
            <OpenBackupForm
              onOpened={setData}
              renderActions={(submit) => <div className="flex justify-end">{submit}</div>}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function NewVaultForm({ data }: { data: ExportData }) {
  const { restore, finishRestore, restoreError } = useRestoreBackup();
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(restoreSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ name, password }: FormValues) => {
    // The restored vault's only copy lives in OPFS: asked while the submit is a user gesture.
    void requestPersistentStorage();
    setLoading(true);
    try {
      const key = await restore(data, password, name);
      if (key) setRecoveryKey(key);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={recoveryKey}
        onDone={() => {
          setRecoveryKey(null);
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormLock locked={loading}>
          <FieldGroup className="gap-5">
            <ControlledInput
              control={control}
              name="name"
              label="Name"
              autoComplete="off"
              placeholder="e.g. Personal"
              labelAction={<span className="text-muted-foreground text-xs">optional</span>}
              leadingIcon={<TagIcon />}
            />
            <ControlledPasswordInput
              control={control}
              name="password"
              label="New master password"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
              labelAction={<span className="text-muted-foreground text-xs">min. 8 characters</span>}
              hint={<NewPasswordStrength control={control} />}
            />
            <ControlledPasswordInput
              control={control}
              name="confirmPassword"
              label="Confirm master password"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
            />

            {restoreError === "unlock_failed" ? (
              <FieldError variant="box">
                Your vault was created, but it couldn&apos;t be opened.{" "}
                <AuthTextLink href={authPaths.login}>Unlock it with your password</AuthTextLink> and
                import the backup under Settings → Security.
              </FieldError>
            ) : (
              restoreError === "failed" && (
                <FieldError variant="box">Creating the vault failed. Please try again.</FieldError>
              )
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              Restore vault
              {loading ? (
                <Spinner data-icon="inline-end" />
              ) : (
                <ArrowRightIcon data-icon="inline-end" />
              )}
            </Button>
          </FieldGroup>
        </FormLock>
      </form>
    </>
  );
}

function NewPasswordStrength({ control }: { control: Control<FormValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
