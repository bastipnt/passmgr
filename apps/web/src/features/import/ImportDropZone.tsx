import { IMPORT_APPS, IMPORT_FILE_ACCEPT, type ImportApp } from "@repo/client";
import { BrandIcon } from "@repo/ui/components/BrandIcon";
import { BrandMark } from "@repo/ui/components/BrandMark";
import { FilePickerButton } from "@repo/ui/components/FilePickerButton";
import { useFileDrop } from "@repo/ui/hooks/use-file-drop";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { FileUpIcon, GlobeIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import LazyImportDialog from "./LazyImportDialog";

const tileClassName = "size-11 rounded-xl";

// Edge has no mark in Simple Icons (Microsoft's were taken out at its request): a plain browser globe.
const APP_ICONS: Record<Exclude<ImportApp, "passmgr">, ReactNode> = {
  bitwarden: <BrandIcon brand="bitwarden" />,
  "1password": <BrandIcon brand="1password" />,
  keepass: <BrandIcon brand="keepassxc" />,
  chrome: <BrandIcon brand="chrome" />,
  edge: <GlobeIcon className="size-5" />,
  firefox: <BrandIcon brand="firefox" />,
  safari: <BrandIcon brand="safari" />,
};

function AppTiles() {
  return (
    <ul
      aria-label="Supported apps"
      className="grid w-full grid-cols-8 gap-2 max-sm:grid-cols-4 max-sm:gap-y-3"
    >
      {IMPORT_APPS.map((app) => (
        <li key={app.id} className="flex flex-col items-center gap-1.5 max-sm:gap-1">
          {app.id === "passmgr" ? (
            <BrandMark className={tileClassName} />
          ) : (
            <span
              aria-hidden="true"
              className={cn("grid place-items-center bg-muted text-foreground", tileClassName)}
            >
              {APP_ICONS[app.id]}
            </span>
          )}
          <span className="text-[13px] leading-4.5">{app.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The import card: drop an export file on it (or choose one) and the Import
 * dialog opens with it, the apps whose exports it reads shown as tiles.
 */
export default function ImportDropZone() {
  const isMobile = useIsMobile();
  const [picked, setPicked] = useState<File>();
  const { dropProps } = useFileDrop(setPicked);

  const chooseFile = (
    <FilePickerButton
      onFile={setPicked}
      accept={IMPORT_FILE_ACCEPT}
      label="Import file"
      variant={isMobile ? "default" : "outline"}
      size={isMobile ? "lg" : "default"}
      className="w-auto justify-center max-sm:w-full"
    >
      Choose file
    </FilePickerButton>
  );

  return (
    <>
      <div
        data-slot="import-drop-zone"
        {...dropProps}
        className="flex flex-col items-center gap-5 rounded-2xl border-2 border-foreground/20 border-dashed bg-card px-6 py-7 text-center transition-colors data-drag-over:border-primary data-drag-over:bg-primary/5 max-sm:gap-4 max-sm:px-4 max-sm:py-5"
      >
        <div className="flex flex-col items-center gap-1.5">
          {!isMobile && (
            <>
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-xl bg-muted text-primary-text [&_svg]:size-5"
              >
                <FileUpIcon />
              </span>
              <p className="font-medium text-base">Drop an export file here</p>
            </>
          )}
          <p className="text-[13px] text-muted-foreground leading-4.5">
            Added to this vault. For items already in it you choose: skip, overwrite or keep both.
          </p>
        </div>
        <AppTiles />
        {isMobile ? (
          chooseFile
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground">or</span>
            {chooseFile}
          </div>
        )}
      </div>
      {/* Outside the zone: React events bubble through the portal, and a drop on the dialog isn't one on the zone. */}
      <LazyImportDialog
        file={picked}
        open={picked !== undefined}
        onOpenChange={(next) => {
          if (!next) setPicked(undefined);
        }}
      />
    </>
  );
}
