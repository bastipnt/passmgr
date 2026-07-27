import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { type LoginRecord as FormValues } from "@repo/schema";
import { useEffect } from "react";
import { normalizeWebsiteUrl } from "@repo/util";
import {
  Button,
  ButtonGroup,
  ControlledInput,
  FieldGroup,
  FieldLegend,
  FieldSet,
  RemoveDialog,
} from "@repo/ui-native";
import { EarthIcon, PlusIcon, TrashIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { Text } from "react-native";

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

  function normalizeWebsite(index: number, value: string) {
    const trimmed = value.trim();
    if (trimmed) setValue(`websites.${index}.value`, normalizeWebsiteUrl(trimmed));
  }

  return (
    <FieldSet>
      <FieldLegend>Websites</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <ButtonGroup key={field.id} className="gap-2">
            <ButtonGroup className="flex-auto ml-6">
              <ControlledInput
                control={control}
                name={`websites.${index}.value`}
                label={`Website ${index}`}
                autoComplete="off"
                placeholder="https://"
                hideLabel
                addon={<EarthIcon size={20} color={iconColor} />}
                // TODO: adjust to mobile
                // onBlur={(e) => normalizeWebsite(index, e.target.value)}
                // onKeyDown={(e) => {
                //   if (e.key === "Enter") normalizeWebsite(index, e.currentTarget.value);
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
        <Text className="text-foreground">Add</Text>
      </Button>
    </FieldSet>
  );
}
