import { type LoginFormValues as FormValues } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { FieldGroup, FieldLegend, FieldSet } from "@repo/ui/components/Field";
import { ControlledExtraField } from "@repo/ui/components/form/ControlledExtraField";
import { LockIcon, MinusIcon, PlusIcon, TextIcon } from "lucide-react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";

type ExtraFormFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

export default function ExtraFormFields({ control }: ExtraFormFieldsProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "customFields",
  });

  return (
    <FieldSet>
      <FieldLegend className="font-semibold text-[0.7rem]! text-muted-foreground uppercase tracking-[0.12em]">
        Additional fields
      </FieldLegend>
      <FieldGroup className="gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="flex w-full items-start gap-2">
            <div className="min-w-0 flex-1">
              <ControlledExtraField
                control={control}
                titleName={`customFields.${index}.title`}
                valueName={`customFields.${index}.value`}
                type={field.type}
                icon={field.type === "secret" ? <LockIcon /> : <TextIcon />}
              />
            </div>

            <RemoveDialog
              title="Delete field"
              description="Are you sure you want to delete this field?"
              removeTitle="Delete"
              onRemove={() => remove(index)}
            >
              <Button
                variant="outline"
                size="icon-sm"
                className="mt-4 rounded-full"
                type="button"
                aria-label="Remove field"
              >
                <MinusIcon />
              </Button>
            </RemoveDialog>
          </div>
        ))}
      </FieldGroup>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="w-fit text-primary dark:text-ring"
            >
              <PlusIcon />
              Add field
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => append({ title: "", type: "text", value: "" })}>
            Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => append({ title: "", type: "secret", value: "" })}>
            Secret
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </FieldSet>
  );
}
