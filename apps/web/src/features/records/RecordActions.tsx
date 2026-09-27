import { SessionContext, ShortcutLayer } from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import {
  EllipsisIcon,
  ExternalLinkIcon,
  PencilLineIcon,
  Timeline,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import { recordPaths } from "@/app/route-paths";
import { displayHost } from "./record-utils";
import { WebsiteAvatar } from "./WebsiteAvatar";

type MoreDropdownProps = {
  recordId: string;
  onDelete: () => void;
};

function MoreDropdown({ recordId, onDelete }: MoreDropdownProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon-lg" aria-label="More actions">
              <EllipsisIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={recordPaths.recordVersions(recordId)} />}>
            <Timeline /> Versions
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <TrashIcon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShortcutLayer active={deleteDialogOpen}>
        <RemoveDialog
          title="Delete item"
          description="Are you sure you want to delete this item? This action cannot be undone."
          removeTitle="Delete"
          onRemove={onDelete}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      </ShortcutLayer>
    </>
  );
}

type RecordActionsProps = {
  recordId: string;
  title: string;
  websites?: { value: string }[];
  onDelete: () => void;
  onSetOpen?: (o: boolean) => void;
  className?: string;
};

export function RecordActions({
  recordId,
  title,
  websites,
  onDelete,
  onSetOpen,
  className,
}: RecordActionsProps) {
  const primaryWebsite = websites?.find((website) => website.value)?.value;
  const { isOffline } = useContext(SessionContext);
  const isMobile = useIsMobile();

  return (
    <div className={cn("flex flex-row items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-row items-center gap-4">
        {isMobile && onSetOpen && (
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => onSetOpen(false)}
          >
            <XIcon />
          </Button>
        )}

        <WebsiteAvatar title={title} websites={websites} size={isMobile ? "default" : "lg"} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-bold font-display text-xl tracking-[-0.02em] sm:text-3xl">
            {title}
          </h1>
          {primaryWebsite && (
            <a
              href={primaryWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
            >
              {displayHost(primaryWebsite)}
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {!isOffline && (
        <div className="flex shrink-0 items-center gap-2">
          <Link
            variant={isMobile ? "default" : "outline"}
            size={isMobile ? "icon-lg" : "lg"}
            className="h-10 font-medium text-sm"
            aria-label="Edit"
            href={recordPaths.editRecord(recordId)}
          >
            <PencilLineIcon />
            {!isMobile && "Edit"}
          </Link>
          <MoreDropdown recordId={recordId} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}
