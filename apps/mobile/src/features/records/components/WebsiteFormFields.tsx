import { type LoginFormValues as FormValues } from "@repo/schema";
import {
  Button,
  ButtonGroup,
  ControlledInput,
  FieldGroup,
  FieldLegend,
  FieldSet,
  RemoveDialog,
} from "@repo/ui-native";
import { normalizeWebsite } from "@repo/util";
import { EarthIcon, PlusIcon, TrashIcon } from "lucide-react-native";
import { useEffect } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
} from "react-hook-form";
import { Text } from "react-native";
import { useCSSVariable } from "uniwind";

type WebsiteFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function WebsiteFormFields({ control, setValue }: WebsiteFieldsProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

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
      <FieldLegend>Websites</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <ButtonGroup key={field.id} className="gap-2">
            <ButtonGroup className="ml-6 flex-auto">
              <ControlledInput
                control={control}
                name={`websites.${index}.value`}
                label={`Website ${index}`}
                autoComplete="off"
                placeholder="example.com"
                hideLabel
                addon={<EarthIcon size={20} color={iconColor} />}
                // TODO: adjust to mobile
                // onBlur={(e) => normalizeRow(index, e.target.value)}
                // onKeyDown={(e) => {
                //   if (e.key === "Enter") normalizeRow(index, e.currentTarget.value);
                // }}
              />
            </ButtonGroup>

            <ButtonGroup>
              <RemoveDialog
                title="Delete field"
                description="Are you sure you want to delete this website?"
                removeTitle="Delete"
                onRemove={() => remove(index)}
              >
                <Button variant="outline" size="icon-lg">
                  <TrashIcon color={iconColor} />
                </Button>
              </RemoveDialog>
            </ButtonGroup>
          </ButtonGroup>
        ))}
      </FieldGroup>
      <Button variant="ghost" className="self-start" onPress={() => append({ value: "" })}>
        <PlusIcon size={20} color={iconColor} />
        <Text className="font-semibold text-primary">Add</Text>
      </Button>
    </FieldSet>
  );
}
