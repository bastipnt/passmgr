import type { CustomField } from "@repo/schema";
import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { AddRowButton } from "@repo/ui/components/AddRowButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { ControlledExtraField } from "@repo/ui/components/form/ControlledExtraField";
import { RemoveRowButton } from "@repo/ui/components/RemoveRowButton";
import { SortableList } from "@repo/ui/components/SortableList";
import { cn } from "@repo/ui/lib/utils";
import { ListPlusIcon } from "lucide-react";
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from "react-hook-form";
import { GeneratePasswordButton } from "@/features/password-generation";

/** Every record form has extra fields. */
type ExtraFieldsFormValues = { customFields?: CustomField[] };

type ExtraFormFieldsProps<T extends ExtraFieldsFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  /** Rows two abreast from `sm` up, for a section that spans the form. */
  wide?: boolean;
};

export default function ExtraFormFields<T extends ExtraFieldsFormValues>(
  props: ExtraFormFieldsProps<T>,
) {
  // Paths don't narrow through a generic: pin the form to `customFields`.
  const { control, setValue, wide } =
    props as unknown as ExtraFormFieldsProps<ExtraFieldsFormValues>;
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "customFields",
  });
  const values = useWatch({ control, name: "customFields" });

  return (
    <DetailSection title="Extra fields" icon={<ListPlusIcon />} count={fields.length}>
      <div className="flex flex-col gap-2">
        <SortableList
          items={fields}
          getKey={(field) => field.id}
          onMove={move}
          itemName={(_, index) => values?.[index]?.title?.trim() || `field ${index + 1}`}
          className={cn("grid items-start gap-2", wide && "sm:grid-cols-2")}
          renderItem={(field, index, handle) => {
            const value = values?.[index];
            return (
              <ControlledExtraField
                control={control}
                titleName={`customFields.${index}.title`}
                valueName={`customFields.${index}.value`}
                type={field.type}
                leading={handle}
                trailing={
                  <>
                    {field.type === "secret" && (
                      <GeneratePasswordButton
                        size="icon"
                        fieldLabel={value?.title || "value"}
                        onUse={(generated) =>
                          setValue(`customFields.${index}.value`, generated, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                    )}
                    <RemoveRowButton
                      noun="field"
                      empty={!value?.title?.trim() && !value?.value?.trim()}
                      onRemove={() => remove(index)}
                    />
                  </>
                }
              />
            );
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<AddRowButton>Add field</AddRowButton>} />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => append({ title: "", type: "text", value: "" })}>
              Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => append({ title: "", type: "secret", value: "" })}>
              Hidden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DetailSection>
  );
}
