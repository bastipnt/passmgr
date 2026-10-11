import { Button } from "@repo/ui/components/Button";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

const FILE_NAME = "passmgr-backup-codes.txt";

function codesText(codes: string[]) {
  return `passmgr two-factor backup codes\nEach code works once.\n\n${codes.join("\n")}\n`;
}

/** Hand the codes to the browser's download, as a text file. */
function download(codes: string[]) {
  const url = URL.createObjectURL(new Blob([codesText(codes)], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME;
  link.click();
  // Not right after the click: some browsers cancel a download whose URL is gone.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Freshly issued backup codes, shown once (the server keeps only their
 * hashes). `onSaved` once copied or downloaded.
 */
export default function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(codesText(codes));
    setCopied(true);
    onSaved();
  };

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label="Backup codes"
        className="grid select-all grid-cols-2 gap-x-6 gap-y-1 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4 font-medium font-mono text-sm dark:border-white/10 dark:bg-black/30"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={() => void onCopy()}>
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            download(codes);
            onSaved();
          }}
        >
          <DownloadIcon />
          Download
        </Button>
      </div>
    </div>
  );
}
