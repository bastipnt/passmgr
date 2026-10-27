import { ShortcutLayer } from "@repo/client";
import { ResponsiveSheet, SheetFormBar } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type RecordFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  onCancel: () => void;
  title: string;
  description: ReactNode;
  media: ReactNode;
  /** The form's submit button; none while there is no form yet (the type picker). */
  submit?: { label: string; phoneLabel: string; pending: boolean; onClick: () => void };
  /** Left in the desktop footer: Delete, back to the type picker. */
  leading?: ReactNode;
  /** Next to Cancel in the desktop footer. */
  footnote?: string;
  children: ReactNode;
};

/** The create and edit sheets' chrome: the record's header, then Cancel / submit (a page bar on phones). */
export default function RecordFormSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onCancel,
  title,
  description,
  media,
  submit,
  leading,
  footnote,
  children,
}: RecordFormSheetProps) {
  const isMobile = useIsMobile();

  const submitButton = submit && (
    <Button
      size="lg"
      className={cn(isMobile && "rounded-full px-5")}
      disabled={submit.pending}
      onClick={submit.onClick}
    >
      {isMobile ? submit.phoneLabel : submit.label}
      {submit.pending && <Spinner data-icon="inline-end" />}
    </Button>
  );

  const actions = isMobile ? (
    <SheetFormBar title={title} action={submitButton} />
  ) : (
    <div className="flex flex-row items-center gap-3">
      {leading}
      <div className="ml-auto flex flex-row items-center gap-3">
        {footnote && (
          <span className="hidden text-muted-foreground text-xs md:inline">{footnote}</span>
        )}
        <Button variant="outline" size="lg" type="button" onClick={onCancel}>
          Cancel
        </Button>
        {submitButton}
      </div>
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={onOpenChangeComplete}
        sheetClassName="sm:max-w-3xl!"
        title={title}
        titleClassName="text-[1.875rem] leading-9"
        description={description}
        media={media}
        actions={actions}
      >
        {children}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
