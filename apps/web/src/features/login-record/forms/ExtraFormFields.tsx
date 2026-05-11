import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@repo/ui/components/DropdownMenu";
import { ButtonGroup } from "@repo/ui/components/ButtonGroup";
import { LockIcon, PlusIcon, TextIcon, TrashIcon } from "lucide-react";
import { FieldGroup, FieldLegend, FieldSet } from "@repo/ui/components/Field";
import { ControlledExtraField } from "@repo/ui/components/form/ControlledExtraField";
import { type LoginItem as FormValues } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";

type ExtraFormFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

export default function ExtraFormFields({ control }: ExtraFormFieldsProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  return (
    <FieldSet>
      <FieldLegend>Additional fields</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <ButtonGroup key={field.id} className="w-full">
            <ButtonGroup className="w-full">
              <ControlledExtraField
                control={control}
                titleName={`extraFields.${index}.title`}
                valueName={`extraFields.${index}.value`}
                type={field.type}
                icon={field.type === "secret" ? <LockIcon /> : <TextIcon />}
              />
            </ButtonGroup>

            <ButtonGroup className="mt-4.5">
              <RemoveDialog
                title="Delete field"
                description="Are you sure you want to delete this field?"
                removeTitle="Delete"
                onRemove={() => remove(index)}
              >
                <Button variant="outline" size="icon" className="[--radius:999rem]" type="button">
                  <TrashIcon />
                </Button>
              </RemoveDialog>
            </ButtonGroup>
          </ButtonGroup>
        ))}
      </FieldGroup>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" type="button" className="w-fit">
              <PlusIcon />
              Add
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
