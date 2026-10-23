import { Button } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useRef } from "react";

type FilePickerButtonProps = {
  onFile: (file: File) => void;
  accept?: string;
  /** Accessible name of the hidden file input. */
  label: string;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
};

function FilePickerButton({
  onFile,
  accept,
  label,
  icon,
  children,
  disabled,
  className,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Picking the same file again (after a wrong password) fires again.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={cn("w-full justify-start", className)}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {icon}
        <span className="truncate">{children}</span>
      </Button>
    </>
  );
}

export { FilePickerButton };
