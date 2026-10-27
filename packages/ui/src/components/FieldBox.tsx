import { Button } from "@repo/ui/components/Button";
import { FieldError } from "@repo/ui/components/Field";
import { fieldBoxClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type FieldBoxProps = {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  invalid?: boolean;
  error?: { message?: string };
  /** Under the box while there is no error. */
  hint?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * A form field shaped like a record-detail row in a box: the label inside at the top,
 * the value under it, icon buttons trailing. The box draws focus, disabled and error
 * states for the control marked `data-slot="field-box-control"` and for `invalid`.
 */
function FieldBox({
  label,
  htmlFor,
  description,
  invalid = false,
  error,
  hint,
  trailing,
  children,
  className,
}: FieldBoxProps) {
  return (
    <div data-slot="field-box-field" className={cn("flex flex-col gap-1.5", className)}>
      <div data-slot="field-box" data-invalid={invalid} className={fieldBoxClassName}>
        <label
          htmlFor={htmlFor}
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            children ? "cursor-text" : "cursor-pointer select-none",
          )}
        >
          <FieldBoxLabel>{label}</FieldBoxLabel>
          {description && <span className="text-foreground/80 text-sm">{description}</span>}
          {children}
        </label>
        {trailing && (
          <div className="flex shrink-0 items-center gap-1 empty:hidden">{trailing}</div>
        )}
      </div>
      {invalid ? <FieldBoxError error={error} /> : hint && <div className="px-3.5">{hint}</div>}
    </div>
  );
}

function FieldBoxLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="field-box-label"
      className={cn(
        "mb-0.5 truncate font-medium text-muted-foreground/70 text-xs transition-colors group-focus-visible/field-box:text-primary-text group-has-[[data-slot=field-box-control]:focus-visible]/field-box:text-primary-text group-aria-expanded/field-box:text-primary-text group-data-[invalid=true]/field-box:text-destructive!",
        className,
      )}
      {...props}
    />
  );
}

function FieldBoxError({ error }: { error?: { message?: string } }) {
  return <FieldError errors={[error]} className="px-3.5 text-[0.78rem]" />;
}

function FieldBoxInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="field-box-control"
      className={cn(
        "w-full min-w-0 bg-transparent p-0 font-medium text-base outline-none placeholder:font-normal placeholder:text-muted-foreground/70 disabled:cursor-not-allowed md:text-[0.97rem]",
        className,
      )}
      {...props}
    />
  );
}

/** A trailing icon button: 40px on phones, 32px from `md` up. */
function FieldBoxButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("text-muted-foreground md:size-8", className)}
      {...props}
    />
  );
}

export { FieldBox, FieldBoxButton, FieldBoxError, FieldBoxInput, FieldBoxLabel };
