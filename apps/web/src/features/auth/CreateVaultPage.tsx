import { zodResolver } from "@hookform/resolvers/zod";
import {
  LINK_ACCOUNT_ERROR_MESSAGES,
  type LinkAccountError,
  type NewRecoveryKey,
  useAppConfig,
  useCreateVault,
} from "@repo/client";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent } from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import {
  ArrowRightIcon,
  CloudIcon,
  HardDriveIcon,
  LockIcon,
  type LucideIcon,
  MailIcon,
  RefreshCwIcon,
  SmartphoneIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { requestPersistentStorage } from "@/hooks/use-storage-durability";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import { useWarnBeforeUnload } from "@/hooks/use-warn-before-unload";
import AuthCardHeader from "./AuthCardHeader";
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
import { useHoldUnlockRedirect } from "./unlock-redirect";

const emailSchema = z.object({ email: z.email() });
type EmailValues = z.infer<typeof emailSchema>;

type Step = "vault" | "sync" | "email";

const SYNC_BENEFITS: { icon: LucideIcon; text: string }[] = [
  { icon: SmartphoneIcon, text: "Access saved logins on your other devices" },
  { icon: CloudIcon, text: "Encrypted backup on the server" },
  { icon: LockIcon, text: "The server never sees your password" },
];

/** Create a vault: name + password, then optionally an account to sync it (`useCreateVault`). */
export default function CreateVaultPage() {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite") ?? undefined;
  const { registrationEnabled } = useAppConfig();
  const canSync = registrationEnabled || invite !== undefined;
  const persistent = useStoragePersistent();

  const holdRedirect = useHoldUnlockRedirect();
  const {
    keepLocal: keepLocalVault,
    createAccount: createAccountVault,
    recoveryKeySaved,
    created,
    keyPending,
    createError,
    linkError,
    clearLinkError,
  } = useCreateVault({ onOpening: () => holdRedirect(true) });

  const [step, setStep] = useState<Step>("vault");
  const [visitedEmail, setVisitedEmail] = useState(false);
  const [vault, setVault] = useState<NewVaultValues>();
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState<NewRecoveryKey>();

  // Closing the tab now would lose a created vault's only recovery key.
  useWarnBeforeUnload(keyPending);

  async function run(action: () => Promise<NewRecoveryKey | undefined>) {
    // This vault's only copy may live in OPFS (ADR 0001 D12). Asked before the
    // key derivation, while the click still counts as a user gesture.
    if (!created) void requestPersistentStorage();
    setLoading(true);
    try {
      setShown(await action());
    } finally {
      setLoading(false);
    }
  }

  const keepLocal = ({ password, name }: NewVaultValues) =>
    run(() => keepLocalVault(password, name));

  const createAccount = ({ email }: EmailValues) =>
    run(async () => vault && createAccountVault(vault.password, vault.name, email, invite));

  const onVaultSubmit = (values: NewVaultValues) => {
    setVault(values);
    if (canSync) setStep("sync");
    else void keepLocal(values);
  };

  const home = useAuthHome();
  const back = {
    vault: () => navigate(home),
    sync: created ? undefined : () => setStep("vault"),
    email: () => {
      clearLinkError();
      setStep("sync");
    },
  }[step];

  const privateWindow = persistent === false;
  const createFailure = createError && <CreateErrorBox error={createError} />;

  return (
    <>
      <PageMeta
        title="Create a vault"
        description="Create a passmgr vault. Encrypted on your device; sync it across devices whenever you want."
        canonicalPath={authPaths.create}
      />
      <RecoveryKeyDialog
        recoveryKey={shown?.recoveryKey ?? null}
        email={shown?.email}
        name={vault?.name || undefined}
        onDone={() => {
          if (!shown) return;
          setShown(undefined);
          setVault(undefined);
          // Either leaves the auth routes, unless the vault doesn't open.
          void recoveryKeySaved(shown);
          holdRedirect(false);
        }}
      />

      <div className="flex w-full flex-col lg:col-span-full lg:mx-auto lg:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar
            onBack={back}
            step={canSync ? (step === "vault" ? 1 : 2) : undefined}
            disabled={loading}
          />

          <div hidden={step !== "vault"} className="flex flex-col gap-6">
            <VaultStep
              onSubmit={onVaultSubmit}
              loading={loading}
              single={!canSync}
              note={
                !canSync &&
                privateWindow && (
                  <PrivateWindowNote>
                    This browser can&apos;t keep your vault (private window?). It&apos;s lost when
                    you reload or close the tab. Use a normal window to keep it.
                  </PrivateWindowNote>
                )
              }
              error={step === "vault" && createFailure}
            />
          </div>

          {step === "sync" && (
            <>
              <AuthCardHeader
                title="Sync across devices?"
                description="Create an account to keep this vault on your other devices too. Still end-to-end encrypted."
              />
              <CardContent className="flex flex-col gap-6">
                {privateWindow ? (
                  <PrivateWindowNote>
                    <strong className="font-semibold">
                      This browser can&apos;t keep your vault
                    </strong>{" "}
                    (private window?). It only survives a reload or closing the tab if you create an
                    online account.
                  </PrivateWindowNote>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {SYNC_BENEFITS.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-center gap-3 text-sm">
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                        >
                          <Icon className="size-4" />
                        </span>
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
                {createFailure}
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={loading}
                    onClick={() => {
                      setVisitedEmail(true);
                      setStep("email");
                    }}
                  >
                    Yes, sync this vault
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    disabled={loading}
                    onClick={() => vault && void keepLocal(vault)}
                  >
                    Not now
                    {loading && <Spinner data-icon="inline-end" />}
                  </Button>
                </div>
                <SyncLaterNote />
              </CardContent>
            </>
          )}

          {visitedEmail && (
            <EmailStep
              visible={step === "email"}
              password={vault?.password ?? ""}
              onSubmit={createAccount}
              onKeepLocal={() => vault && void keepLocal(vault)}
              loading={loading}
              linkError={linkError}
              onEdit={clearLinkError}
              error={createFailure}
            />
          )}
        </Card>
      </div>
    </>
  );
}

function VaultStep({
  onSubmit,
  loading,
  single,
  note,
  error,
}: {
  onSubmit: (values: NewVaultValues) => void;
  loading: boolean;
  /** No sync step follows: this one creates the vault. */
  single: boolean;
  note: ReactNode;
  error: ReactNode;
}) {
  const { handleSubmit, control } = useForm<NewVaultValues>({
    resolver: zodResolver(newVaultSchema),
    defaultValues: NEW_VAULT_DEFAULTS,
  });

  return (
    <>
      <AuthCardHeader
        title="Create a new vault"
        description="Give it a name and choose a password. You'll use the password every time you unlock."
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={loading}>
            <FieldGroup className="gap-5">
              {note}
              <NewVaultFields control={control} />
              {error}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {single ? "Create vault" : "Continue"}
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
    </>
  );
}

function EmailStep({
  visible,
  password,
  onSubmit,
  onKeepLocal,
  loading,
  linkError,
  onEdit,
  error,
}: {
  /** Hidden, not unmounted, on Back: the typed email stays. */
  visible: boolean;
  password: string;
  onSubmit: (values: EmailValues) => void;
  onKeepLocal: () => void;
  loading: boolean;
  linkError?: LinkAccountError;
  onEdit: () => void;
  error: ReactNode;
}) {
  const { handleSubmit, control, watch, setFocus } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (visible) setFocus("email");
  }, [visible, setFocus]);

  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type === "change") onEdit();
    });
    return () => subscription.unsubscribe();
  }, [watch, onEdit]);

  return (
    <div hidden={!visible} className="flex flex-col gap-6">
      <AuthCardHeader
        title="Sync across devices"
        description="Add your email to sign in on other devices."
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={loading}>
            <FieldGroup className="gap-5">
              {/* For password managers: the new password goes with this email. */}
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                readOnly
                hidden
              />
              <ControlledInput
                control={control}
                name="email"
                label="Email"
                type="email"
                autoComplete="username"
                leadingIcon={<MailIcon />}
                hint={
                  !linkError && <p className="text-muted-foreground text-xs">Stored encrypted.</p>
                }
              />
              {linkError && (
                <FieldError variant="box">
                  {linkError === "unreachable" ? (
                    <span>
                      <strong className="font-semibold">Couldn&apos;t reach the server.</strong> Try
                      again, or keep the vault on this device for now.
                    </span>
                  ) : (
                    LINK_ACCOUNT_ERROR_MESSAGES[linkError]
                  )}
                </FieldError>
              )}
              {error}
              <div className="flex flex-col gap-3">
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {linkError ? (
                    <>
                      <RefreshCwIcon data-icon="inline-start" />
                      Try again
                    </>
                  ) : (
                    <>
                      Create account
                      {!loading && <ArrowRightIcon data-icon="inline-end" />}
                    </>
                  )}
                  {loading && <Spinner data-icon="inline-end" />}
                </Button>
                {linkError && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    disabled={loading}
                    onClick={onKeepLocal}
                  >
                    <HardDriveIcon data-icon="inline-start" />
                    Create local vault only
                  </Button>
                )}
              </div>
              {linkError && <SyncLaterNote />}
            </FieldGroup>
          </FormLock>
        </form>
      </CardContent>
    </div>
  );
}

function SyncLaterNote() {
  return (
    <p className="text-center text-muted-foreground text-xs">
      You can turn on sync later in Settings.
    </p>
  );
}
