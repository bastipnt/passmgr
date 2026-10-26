import { type LoginFormValues as FormValues } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { FieldGroup, FieldLegend, FieldSet } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { normalizeWebsite } from "@repo/util";
import { EarthIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
} from "react-hook-form";

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

  function normalizeRow(index: number, value: string) {
    setValue(`websites.${index}.value`, normalizeWebsite(value));
  }

  return (
    <FieldSet>
      <FieldLegend className="font-semibold text-[0.7rem]! text-muted-foreground uppercase tracking-[0.12em]">
        Websites
      </FieldLegend>
      <FieldGroup className="gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="flex w-full items-center gap-2">
            <div className="min-w-0 flex-1">
              <ControlledInput
                control={control}
                name={`websites.${index}.value`}
                label={`Website ${index}`}
                autoComplete="off"
                placeholder="example.com"
                hideLabel
                leadingIcon={<EarthIcon />}
                onBlur={(e) => normalizeRow(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") normalizeRow(index, e.currentTarget.value);
                }}
              />
            </div>

            <RemoveDialog
              title="Delete field"
              description="Are you sure you want to delete this website?"
              removeTitle="Delete"
              onRemove={() => remove(index)}
            >
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                type="button"
                aria-label="Remove website"
              >
                <MinusIcon />
              </Button>
            </RemoveDialog>
          </div>
        ))}
      </FieldGroup>
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-primary-text"
        onClick={() => append({ value: "" })}
        type="button"
      >
        <PlusIcon />
        Add website
      </Button>
    </FieldSet>
  );
}
