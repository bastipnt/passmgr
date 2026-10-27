import { useTags } from "@repo/client";
import { MAX_TAG_LENGTH } from "@repo/schema";
import { ControlledTagInput } from "@repo/ui/components/form/ControlledTagInput";
import type { Control } from "react-hook-form";

type TagsFormValues = { tags?: string[] };

type RecordTagsFieldProps<T extends TagsFormValues> = {
  control: Control<T>;
  className?: string;
};

export function RecordTagsField<T extends TagsFormValues>({
  control,
  className,
}: RecordTagsFieldProps<T>) {
  const suggestions = useTags().map(({ tag }) => tag);

  return (
    <ControlledTagInput
      control={control as unknown as Control<TagsFormValues>}
      name="tags"
      label="Tags"
      suggestions={suggestions}
      maxLength={MAX_TAG_LENGTH}
      className={className}
    />
  );
}
