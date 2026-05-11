import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { type LoginItem as FormValues } from "@repo/schema";
import { useEffect } from "react";
import { FieldGroup, FieldLegend, FieldSet } from "@repo/ui/components/Field";
import { ButtonGroup } from "@repo/ui/components/ButtonGroup";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { InputGroupAddon } from "@repo/ui/components/InputGroup";
import { EarthIcon, PlusIcon, TrashIcon } from "lucide-react";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { normalizeWebsiteUrl } from "@repo/util";

type WebsiteFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function WebsiteFormFields({ control, setValue }: WebsiteFieldsProps) {
  const { fields, append, replace, remove } = useFieldArray({
    control,
    name: "websites",
  });

  useEffect(() => {
    if (fields.length >= 1) return;

    replace({ value: "" });
  }, [fields.length, replace]);

  function normalizeWebsite(index: number, value: string) {
    const trimmed = value.trim();
    if (trimmed) setValue(`websites.${index}.value`, normalizeWebsiteUrl(trimmed));
  }

  return (
    <FieldSet>
      <FieldLegend>Websites</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <ButtonGroup key={field.id} className="w-full">
            <ButtonGroup className="w-full ml-6">
              <ControlledInput
                control={control}
                name={`websites.${index}.value`}
                label={`Website ${index}`}
                autoComplete="off"
                placeholder="https://"
                hideLabel
                addon={
                  <InputGroupAddon>
                    <EarthIcon />
                  </InputGroupAddon>
                }
                onBlur={(e) => normalizeWebsite(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") normalizeWebsite(index, e.currentTarget.value);
                }}
              />
            </ButtonGroup>

            <ButtonGroup>
              <RemoveDialog
                title="Delete field"
                description="Are you sure you want to delete this website?"
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
      <Button variant="ghost" className="w-fit" onClick={() => append({ value: "" })} type="button">
        <PlusIcon />
        Add
      </Button>
    </FieldSet>
  );
}
