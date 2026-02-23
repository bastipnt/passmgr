import {
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "@repo/ui/components/Link";
import { Button } from "@repo/ui/components/Button";
import { useEffect } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { ButtonGroup } from "@repo/ui/components/ButtonGroup";
import { PlusIcon, TrashIcon, XIcon } from "lucide-react";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { loginItemSchema, type LoginItem as FormValues } from "@repo/schema";

type WebsiteFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

function WebsiteFields({ control }: WebsiteFieldsProps) {
  const { fields, append, replace, remove } = useFieldArray({
    control,
    name: "websites",
  });

  useEffect(() => {
    if (fields.length >= 1) return;

    replace({ value: "" });
  }, [fields.length, replace]);

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
              />
            </ButtonGroup>

            <ButtonGroup>
              <Button
                variant="outline"
                size="icon"
                className="[--radius:999rem]"
                onClick={() => remove(index)}
              >
                <TrashIcon />
              </Button>
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
              <ControlledInput
                control={control}
                name={`extraFields.${index}.value`}
                label={field.title}
                autoComplete="off"
              />
            </ButtonGroup>

            <ButtonGroup className="items-end">
              <Button
                variant="outline"
                size="icon"
                className="[--radius:999rem]"
                onClick={() => remove(index)}
              >
                <TrashIcon />
              </Button>
            </ButtonGroup>
          </ButtonGroup>
        ))}
      </FieldGroup>
      <Button
        variant="ghost"
        className="w-fit"
        onClick={() => append({ title: "Field", type: "text", value: "" })}
        type="button"
      >
        <PlusIcon />
        Add
      </Button>
    </FieldSet>
  );
}

type PassItemProps = {
  onSubmit: (data: FormValues) => void;
  title: string;
  action: string;
  serverError?: string;
  defaultValues?: Partial<FormValues>;
};

export default function LoginItemForm({
  onSubmit,
  serverError,
  defaultValues,
  title,
  action,
}: PassItemProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(loginItemSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card className="w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardAction>
            <Link variant="ghost" href="/">
              <XIcon />
            </Link>
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <FieldSet>
              <ControlledInput control={control} name="title" label="Title" autoComplete="off" />

              <ControlledInput
                control={control}
                name="username"
                label="Username"
                autoComplete="username"
              />

              <ControlledInput
                control={control}
                name="password"
                label="Password"
                type="password"
                autoComplete="new-password"
              />

              <ControlledInput
                control={control}
                name="totp"
                label="2FA token secret (TOTP)"
                autoComplete="off"
              />
            </FieldSet>

            <FieldSeparator />

            <WebsiteFields control={control} register={register} errors={errors} />

            <FieldSeparator />

            <FieldSet>
              {/* TODO: textarea */}
              <ControlledInput control={control} name="note" label="Notes" autoComplete="off" />
            </FieldSet>

            <FieldSeparator />

            <ExtraFields control={control} register={register} errors={errors} />

            {serverError && <FieldError>{serverError}</FieldError>}
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex flex-row gap-4 justify-end">
          <Link variant="outline" href={"/"}>
            Cancel
          </Link>
          <Button type="submit">{action}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
