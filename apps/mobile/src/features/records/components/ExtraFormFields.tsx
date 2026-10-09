import type { CustomField } from "@repo/schema";
import {
  BottomSheet,
  BottomSheetRef,
  Button,
  ButtonGroup,
  ControlledExtraField,
  FieldGroup,
  FieldLegend,
  FieldSet,
  RemoveDialog,
} from "@repo/ui-native";
import { LockIcon, PlusIcon, TextIcon, TrashIcon } from "lucide-react-native";
import { useCallback, useRef } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { Text } from "react-native";
import { useCSSVariable } from "uniwind";

/** Every record form has extra fields. */
type ExtraFieldsFormValues = { customFields?: CustomField[] };

type ExtraFormFieldsProps<T extends ExtraFieldsFormValues> = {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

export default function ExtraFormFields<T extends ExtraFieldsFormValues>(
  props: ExtraFormFieldsProps<T>,
) {
  // Paths don't narrow through a generic: pin the form to `customFields`.
  const { control } = props as unknown as ExtraFormFieldsProps<ExtraFieldsFormValues>;
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "customFields",
  });

  const sheetRef = useRef<BottomSheetRef>(null);

  const appendExtraField = useCallback(
    (type: "text" | "secret") => {
      sheetRef.current?.triggerShowHide(false);
      append({ title: "", type, value: "" });
    },
    [append],
  );

  return (
    <FieldSet>
      <FieldLegend>Additional fields</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <ButtonGroup key={field.id} className="w-full gap-2">
            <ButtonGroup className="flex-1">
              <ControlledExtraField
                control={control}
                titleName={`customFields.${index}.title`}
                valueName={`customFields.${index}.value`}
                type={field.type}
                icon={
                  field.type === "secret" ? (
                    <LockIcon size={20} color={iconColor} />
                  ) : (
                    <TextIcon size={20} color={iconColor} />
                  )
                }
              />
            </ButtonGroup>

            <ButtonGroup>
              <RemoveDialog
                title="Delete field"
                description="Are you sure you want to delete this field?"
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

      <Button
        variant="ghost"
        className="self-start"
        onPress={() => sheetRef.current?.triggerShowHide(true)}
      >
        <PlusIcon size={20} color={iconColor} />
        <Text className="font-semibold text-primary">Add</Text>
      </Button>

      <BottomSheet ref={sheetRef} className="gap-4 py-8">
        <Button onPress={() => appendExtraField("text")}>
          <Text>Text</Text>
        </Button>
        <Button onPress={() => appendExtraField("secret")}>
          <Text>Secret</Text>
        </Button>
      </BottomSheet>
    </FieldSet>
  );
}
