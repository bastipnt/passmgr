import {
  IMPORT_ERROR_MESSAGES,
  type ImportError,
  MAX_IMPORT_FILE_BYTES,
  openExportEnvelope,
  readExportFile,
  readFileError,
} from "@repo/client";
import type { ExportData, ExportEnvelope } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/InputGroup";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, FileUpIcon, KeyRoundIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

type OpenBackupFormProps = {
  /** The file's records, decrypted. */
  onOpened: (data: ExportData) => void;
  /** Rendered under the fields, e.g. a warning. */
  children?: ReactNode;
  /** Wraps the submit button (a dialog footer with Cancel, …). */
  renderActions?: (submit: ReactNode) => ReactNode;
};

/**
 * Pick an export file (ADR 0001 D12) and open it: an encrypted backup asks for
 * its backup password, a plain JSON export opens as is.
 */
export default function OpenBackupForm({ onOpened, children, renderActions }: OpenBackupFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const [fileName, setFileName] = useState<string>();
  const [envelope, setEnvelope] = useState<ExportEnvelope>();
  const [password, setPassword] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<ImportError>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setEnvelope(undefined);
    setPassword("");
    setFileName(file.name);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("too_large");
      return;
    }
    try {
      const contents = readExportFile(await file.text());
      if (contents.encrypted) setEnvelope(contents.envelope);
      else onOpened(contents.data);
    } catch (e) {
      setError(readFileError(e));
    }
  }

  async function open(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!envelope || !password) return;
    setError(undefined);
    setOpening(true);
    try {
      onOpened(await openExportEnvelope(envelope, password));
    } catch (e) {
      const reason = readFileError(e);
      if (reason === "failed") console.error("Opening the backup failed", e);
      setError(reason);
    } finally {
      setOpening(false);
    }
  }

  const submit = (
    <Button type="submit" disabled={!envelope || !password || opening}>
      Continue
      {opening ? <Spinner data-icon="inline-end" /> : <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  );

  return (
    <form onSubmit={open}>
      <FieldGroup className="my-4 gap-4">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Backup file"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            // Picking the same file again (after a wrong password) fires again.
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={opening}
          onClick={() => inputRef.current?.click()}
        >
          <FileUpIcon />
          <span className="truncate">{fileName ?? "Choose a backup file…"}</span>
        </Button>

        {envelope && (
          <Field>
            <FieldLabel htmlFor={passwordId}>Backup password</FieldLabel>
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

        {error && <FieldError variant="box">{IMPORT_ERROR_MESSAGES[error]}</FieldError>}
        {children}
      </FieldGroup>
      {renderActions ? renderActions(submit) : submit}
    </form>
  );
}
