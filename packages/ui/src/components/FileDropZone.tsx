import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, type Ref, useImperativeHandle, useRef, useState } from "react";

export type FileDropZoneHandle = { open: () => void };

type FileDropZoneProps = {
  onFile: (file: File) => void;
  accept?: string;
  /** Accessible name of the hidden file input. */
  label: string;
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** `open()` shows the file picker, e.g. for a "Change" button elsewhere. */
  ref?: Ref<FileDropZoneHandle>;
};

function FileDropZone({
  onFile,
  accept,
  label,
  icon,
  title,
  hint,
  disabled,
  className,
  ref,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), []);

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
          // Picking the same file again fires again.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        data-slot="file-drop-zone"
        data-drag-over={dragOver || undefined}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && !disabled) onFile(file);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-primary/35 border-dashed bg-primary/[0.03] px-6 py-8 text-center outline-none transition-colors hover:bg-primary/6 focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 data-drag-over:border-primary data-drag-over:bg-primary/10",
          className,
        )}
      >
        <span
          aria-hidden
          className="mb-2 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary-text [&>svg]:size-5"
        >
          {icon}
        </span>
        <span className="font-semibold text-[0.95rem]">{title}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </button>
    </>
  );
}

export { FileDropZone };
