import { generateSshKeyPair, sshKeyFingerprint, sshPublicKeyFromPrivateKey } from "@repo/crypto";
import type { RecordFormValues } from "@repo/schema";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { FileUpIcon, SparklesIcon } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";

type SshFormValues = RecordFormValues<"ssh_key">;

type SshKeyActionsProps = {
  control: Control<SshFormValues>;
  setValue: UseFormSetValue<SshFormValues>;
};

/** Key files are a few KB; anything far bigger is not one. */
const MAX_KEY_FILE_BYTES = 64 * 1024;

const SET = { shouldDirty: true, shouldValidate: true } as const;

/**
 * Generate a new Ed25519 key, or import a key file: a private key (its public
 * key is read from the file when it's in OpenSSH's format) or a `.pub` line.
 * Both stay on the device until the record is saved, encrypted.
 */
export function SshKeyActions({ control, setValue }: SshKeyActionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const privateKey = useWatch({ control, name: "privateKey" });

  function generate() {
    // No comment: the public key line gets pasted into servers and code hosts,
    // and a record title may say more than it should there.
    const pair = generateSshKeyPair();
    setValue("privateKey", pair.privateKey, SET);
    setValue("publicKey", pair.publicKey, SET);
    setValue("passphrase", "", SET);
    toast.success("New Ed25519 key generated");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_KEY_FILE_BYTES) {
      toast.error("That file is too big to be a key");
      return;
    }

    const text = (await file.text()).trim();
    if (/PRIVATE KEY-----/.test(text)) {
      setValue("privateKey", `${text}\n`, SET);
      const publicKey = sshPublicKeyFromPrivateKey(text);
      if (publicKey) setValue("publicKey", publicKey, SET);
      toast.success(publicKey ? "Key imported" : "Private key imported; add its public key");
    } else if (sshKeyFingerprint(text)) {
      setValue("publicKey", text, SET);
      toast.success("Public key imported");
    } else {
      toast.error("That file doesn't contain an SSH key");
    }
  }

  const generateLabel = (
    <>
      <SparklesIcon />
      Generate key
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {privateKey ? (
        // Generating over a key would silently lose it from the form.
        <RemoveDialog
          title="Replace this key?"
          description="The new key replaces the one in this form. The old key stays in the record's history once you save."
          removeTitle="Replace"
          onRemove={generate}
        >
          <Button variant="outline" size="sm" type="button">
            {generateLabel}
          </Button>
        </RemoveDialog>
      ) : (
        <Button variant="outline" size="sm" type="button" onClick={generate}>
          {generateLabel}
        </Button>
      )}
      <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()}>
        <FileUpIcon />
        Import key file
      </Button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(event) => void importFile(event)}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

/** The public key's fingerprint under its field, once there is a valid one. */
export function SshFingerprintHint({ control }: { control: Control<SshFormValues> }) {
  const publicKey = useWatch({ control, name: "publicKey" }) ?? "";
  const fingerprint = publicKey ? sshKeyFingerprint(publicKey) : undefined;
  if (!fingerprint) return null;
  return <p className="break-all font-mono text-muted-foreground text-xs">{fingerprint}</p>;
}
