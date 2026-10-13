import { useTags } from "@repo/client";
import { MAX_TAG_LENGTH } from "@repo/schema";
import { ControlledTagInput, FieldSet } from "@repo/ui-native";
import type { Control } from "react-hook-form";

type TagsFormValues = { tags?: string[] };

export function RecordTagsField<T extends TagsFormValues>({ control }: { control: Control<T> }) {
  const suggestions = useTags().map(({ tag }) => tag);

  return (
    <FieldSet>
      <ControlledTagInput
        control={control as unknown as Control<TagsFormValues>}
        name="tags"
        label="Tags"
        suggestions={suggestions}
        maxLength={MAX_TAG_LENGTH}
      />
    </FieldSet>
  );
}
