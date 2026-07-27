import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { type LoginRecord as FormValues } from "@repo/schema";
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
import { Text } from "react-native";
import { useCSSVariable } from "uniwind";
import { useCallback, useRef } from "react";

type ExtraFormFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

export default function ExtraFormFields({ control }: ExtraFormFieldsProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
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
                titleName={`extraFields.${index}.title`}
                valueName={`extraFields.${index}.value`}
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
        <Text className="text-foreground">Add</Text>
      </Button>

      <BottomSheet ref={sheetRef} className="py-8 gap-4">
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
