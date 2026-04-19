import {
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@repo/ui/components/DropdownMenu";
import { useEffect } from "react";
import { ButtonGroup } from "@repo/ui/components/ButtonGroup";
import {
  EarthIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  PlusIcon,
  TagIcon,
  TextIcon,
  TrashIcon,
} from "lucide-react";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@repo/ui/components/Field";
import { InputGroupAddon } from "@repo/ui/components/InputGroup";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { ControlledExtraField } from "@repo/ui/components/form/ControlledExtraField";
import { loginItemSchema, type LoginItem as FormValues } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";

function normalizeWebsiteUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

type WebsiteFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

function WebsiteFields({ control, setValue }: WebsiteFieldsProps) {
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
            <ButtonGroup className="w-full">
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

type ExtraFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

function ExtraFields({ control }: ExtraFieldsProps) {
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-fit" type="button">
            <PlusIcon />
            Add
          </Button>
        </DropdownMenuTrigger>
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

type PassItemProps = {
  onSubmit: (data: FormValues) => void;
  onDelete?: () => void;
  action: string;
  serverError?: string;
  defaultValues?: Partial<FormValues>;
  onCancel: () => void;
};

export default function LoginItemForm({
  onSubmit,
  onDelete,
  serverError,
  defaultValues,
  action,
  onCancel,
}: PassItemProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(loginItemSchema),
    defaultValues,
  });

  function handleFormSubmit(data: FormValues) {
    onSubmit({
      ...data,
      websites: data.websites
        ?.map(({ value, ...rest }) => ({ ...rest, value: value.trim() }))
        .filter(({ value }) => value !== "")
        .map(({ value, ...rest }) => ({ ...rest, value: normalizeWebsiteUrl(value) })),
    });
  }

  const formFields = (
    <FieldGroup>
      <FieldSet>
        <ControlledInput
          control={control}
          name="title"
          label="Title"
          autoComplete="off"
          icon={<TagIcon />}
        />

        <ControlledInput
          control={control}
          name="username"
          label="Username"
          autoComplete="off"
          icon={<MailIcon />}
        />

        <ControlledInput
          className="[-webkit-text-security:disc] focus:[-webkit-text-security:none]"
          control={control}
          name="password"
          label="Password"
          type="text"
          autoComplete="off"
          icon={<KeyIcon />}
        />

        <ControlledInput
          control={control}
          name="totp"
          label="2FA token secret (TOTP)"
          autoComplete="off"
          icon={<LockIcon />}
        />
      </FieldSet>

      <FieldSeparator />

      <WebsiteFields control={control} register={register} errors={errors} setValue={setValue} />

      <FieldSeparator />

      <FieldSet>
        <ControlledTextarea
          control={control}
          name="note"
          label="Notes"
          autoComplete="off"
          icon={<NotebookPenIcon />}
        />
      </FieldSet>

      <FieldSeparator />

      <ExtraFields control={control} register={register} errors={errors} />

      {serverError && <FieldError>{serverError}</FieldError>}
    </FieldGroup>
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} autoComplete="off">
      {formFields}
      <div className="mt-6 flex flex-row gap-4 justify-between">
        <div>
          {onDelete && (
            <RemoveDialog
              title="Delete item"
              description="Are you sure you want to delete this item? This action cannot be undone."
              removeTitle="Delete"
              onRemove={onDelete}
            >
              <Button variant="ghost" type="button">
                <TrashIcon /> Delete
              </Button>
            </RemoveDialog>
          )}
        </div>
        <div className="flex flex-row gap-4">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{action}</Button>
        </div>
      </div>
    </form>
  );
}
