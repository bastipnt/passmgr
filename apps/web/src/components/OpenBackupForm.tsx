import {
  type ForeignImport,
  IMPORT_ERROR_MESSAGES,
  IMPORT_FILE_ACCEPT,
  useOpenImportFile,
} from "@repo/client";
import type { ExportData } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { FilePickerButton } from "@repo/ui/components/FilePickerButton";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/InputGroup";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, FileUpIcon, KeyRoundIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import KeyFileButton from "./KeyFileButton";

type OpenBackupFormProps = {
  /** The file's records, decrypted. */
  onOpened: (data: ExportData) => void;
  /** Also accept other password managers' exports, handed over here. */
  onForeignOpened?: (foreign: ForeignImport) => void;
  /** Rendered under the fields, e.g. a warning. */
  children?: ReactNode;
  /** Wraps the submit button (a dialog footer with Cancel, …). */
  renderActions?: (submit: ReactNode) => ReactNode;
};

/**
 * Pick an export file (ADR 0001 D12) and open it: an encrypted backup asks for
 * its backup password, a plain JSON export opens as is. With `onForeignOpened`,
 * another password manager's export too, and a KeePass database (password and
 * an optional key file).
 */
export default function OpenBackupForm({
  onOpened,
  onForeignOpened,
  children,
  renderActions,
}: OpenBackupFormProps) {
  const passwordId = useId();
  const [keyFile, setKeyFile] = useState<{ name: string; bytes: Uint8Array }>();
  const [password, setPassword] = useState("");
  const importFile = useOpenImportFile(
    (opened) => {
      if (opened.kind === "foreign") onForeignOpened?.(opened.foreign);
      else onOpened(opened.data);
    },
    { foreign: !!onForeignOpened },
  );
  const { file, locked, opening, error } = importFile;

  function open(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canOpen) void importFile.open(password, keyFile?.bytes);
  }

  // A KeePass database may have an empty password.
  const canOpen = locked === "kdbx" || (locked === "backup" && !!password);
  const submit = (
    <Button type="submit" disabled={!canOpen || opening}>
      Continue
      {opening ? <Spinner data-icon="inline-end" /> : <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  );

  return (
    <form onSubmit={open}>
      <FieldGroup className="my-4 gap-4">
        <FilePickerButton
          onFile={(picked) => {
            setKeyFile(undefined);
            setPassword("");
            void importFile.pick(picked);
          }}
          accept={onForeignOpened ? IMPORT_FILE_ACCEPT : ".json,application/json"}
          label={onForeignOpened ? "Export file" : "Backup file"}
          icon={<FileUpIcon />}
          disabled={opening}
        >
          {file?.name ?? (onForeignOpened ? "Choose an export file…" : "Choose a backup file…")}
        </FilePickerButton>

        {locked && (
          <Field>
            <FieldLabel htmlFor={passwordId}>
              {locked === "kdbx" ? "Database password" : "Backup password"}
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <KeyRoundIcon />
              </InputGroupAddon>
              <InputGroupInput
                id={passwordId}
                type="password"
                autoComplete="off"
                value={password}
                disabled={opening}
                onChange={(e) => setPassword(e.target.value)}
              />
            </InputGroup>
          </Field>
        )}

        {locked === "kdbx" && (
          <Field>
            <KeyFileButton keyFile={keyFile} onKeyFile={setKeyFile} disabled={opening} />
          </Field>
        )}

        {error && <FieldError variant="box">{IMPORT_ERROR_MESSAGES[error]}</FieldError>}
        {children}
      </FieldGroup>
      {renderActions ? renderActions(submit) : submit}
    </form>
  );
}
