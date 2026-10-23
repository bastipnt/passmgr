import { FilePickerButton } from "@repo/ui/components/FilePickerButton";
import { FileKeyIcon } from "lucide-react";

/** A KeePass key file, read into memory once picked. */
export default function KeyFileButton({
  keyFile,
  onKeyFile,
  disabled,
}: {
  keyFile: { name: string } | undefined;
  onKeyFile: (keyFile: { name: string; bytes: Uint8Array }) => void;
  disabled?: boolean;
}) {
  return (
    <FilePickerButton
      onFile={(file) =>
        void file
          .arrayBuffer()
          .then((buffer) => onKeyFile({ name: file.name, bytes: new Uint8Array(buffer) }))
      }
      label="Key file"
      icon={<FileKeyIcon />}
      disabled={disabled}
    >
      {keyFile?.name ?? "Key file (optional)…"}
    </FilePickerButton>
  );
}
