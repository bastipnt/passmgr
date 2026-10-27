import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { FieldBoxButton } from "@repo/ui/components/FieldBox";
import { XIcon } from "lucide-react";

type RemoveRowButtonProps = {
  /** What the row is, lower case: "website", "field". */
  noun: string;
  /** An empty row goes at once; a filled one asks first. */
  empty: boolean;
  onRemove: () => void;
};

export function RemoveRowButton({ noun, empty, onRemove }: RemoveRowButtonProps) {
  const button = (
    <FieldBoxButton aria-label={`Remove ${noun}`} onClick={empty ? onRemove : undefined}>
      <XIcon />
    </FieldBoxButton>
  );

  if (empty) return button;

  return (
    <RemoveDialog
      title={`Delete ${noun}`}
      description={`Are you sure you want to delete this ${noun}?`}
      removeTitle="Delete"
      onRemove={onRemove}
    >
      {button}
    </RemoveDialog>
  );
}
