import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { AddRowButton } from "@repo/ui/components/AddRowButton";
import { ControlledBoxedInput } from "@repo/ui/components/form/ControlledBoxedInput";
import { RemoveRowButton } from "@repo/ui/components/RemoveRowButton";
import { SortableList } from "@repo/ui/components/SortableList";
import { useWebsiteAvatar } from "@repo/ui-shared";
import { normalizeWebsite } from "@repo/util";
import { EarthIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from "react-hook-form";

/** Any form with a websites list: a login. */
type WebsiteFormValues = { websites?: { value: string }[] };

type WebsiteFieldsProps<T extends WebsiteFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
};

export default function WebsiteFormFields<T extends WebsiteFormValues>(
  props: WebsiteFieldsProps<T>,
) {
  // Paths don't narrow through a generic: pin the form to `websites`.
  const { control, setValue } = props as unknown as WebsiteFieldsProps<WebsiteFormValues>;
  const { fields, append, replace, remove, move } = useFieldArray({
    control,
    name: "websites",
  });
  const values = useWatch({ control, name: "websites" }) ?? [];
  const filled = values.filter((site) => site?.value?.trim()).length;
  // The row being typed in keeps the favicon of its value on focus: no host leaves while typing.
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);

  useEffect(() => {
    if (fields.length >= 1) return;

    replace({ value: "" });
  }, [fields.length, replace]);

  function normalizeRow(index: number, value: string) {
    setValue(`websites.${index}.value`, normalizeWebsite(value), { shouldDirty: true });
  }

  return (
    <DetailSection title="Websites" icon={<EarthIcon />} count={filled}>
      <div className="flex flex-col gap-2">
        <SortableList
          items={fields}
          getKey={(field) => field.id}
          onMove={move}
          itemName={(_, index) => values[index]?.value?.trim() || `website ${index + 1}`}
          className="flex flex-col gap-2"
          renderItem={(_, index, handle) => {
            const value = values[index]?.value ?? "";
            return (
              <ControlledBoxedInput
                control={control}
                name={`websites.${index}.value`}
                label={`Website ${index + 1}`}
                hideLabel
                size="sm"
                autoComplete="off"
                placeholder="example.com"
                leading={
                  <>
                    {handle}
                    <WebsiteFavicon website={editing?.index === index ? editing.value : value} />
                  </>
                }
                trailing={
                  <RemoveRowButton
                    noun="website"
                    empty={!value.trim()}
                    onRemove={() => remove(index)}
                  />
                }
                onFocus={() => setEditing({ index, value })}
                onBlur={(e) => {
                  setEditing(null);
                  normalizeRow(index, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") normalizeRow(index, e.currentTarget.value);
                }}
              />
            );
          }}
        />
        <AddRowButton onClick={() => append({ value: "" })}>Add website</AddRowButton>
      </div>
    </DetailSection>
  );
}

/** The site's favicon, or a globe. */
function WebsiteFavicon({ website }: { website: string }) {
  const { src, status } = useWebsiteAvatar({ title: "", websites: [{ value: website }] });

  return (
    <span aria-hidden className="mr-1 grid size-4.5 shrink-0 place-items-center">
      {status === "ok" && src ? (
        <img src={src} alt="" className="size-4.5 rounded-sm" />
      ) : (
        <EarthIcon className="size-4 text-muted-foreground/70" />
      )}
    </span>
  );
}
