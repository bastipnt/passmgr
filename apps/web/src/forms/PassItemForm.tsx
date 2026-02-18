import type z from "zod";
import styles from "./PassItemForm.module.css";
import { entrySchema } from "@repo/client";
import {
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Input from "@components/Input";
import ButtonLink from "@components/ButtonLink";
import { TiCancel, TiPlus, TiTimes, TiUpload } from "react-icons/ti";
import { Button } from "@components/Button";
import { useEffect } from "react";

type FormValues = z.infer<typeof entrySchema>;

type WebsiteFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

function WebsiteFields({ control, register, errors }: WebsiteFieldsProps) {
  const { fields, append, replace, remove } = useFieldArray({
    control,
    name: "websites",
  });

  useEffect(() => {
    if (fields.length >= 1) return;

    replace({ value: "" });
  }, [fields.length, replace]);

  return (
    <fieldset>
      <legend>Websites</legend>
      {fields.map((field, index) => (
        <div className={styles.inputGroup} key={field.id}>
          <Input
            label={`Website ${index}`}
            placeholder="https://"
            {...register(`websites.${index}.value`)}
            error={errors.websites && errors.websites[index]?.message}
            hideLabel
          />
          <Button variant="ghost" size="sm" onClick={() => remove(index)}>
            <TiTimes />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.addBtn}
        onClick={() => append({ value: "" })}
        type="button"
      >
        <TiPlus />
        Add
      </Button>
    </fieldset>
  );
}

type ExtraFieldsProps = {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
};

function ExtraFields({ control, register, errors }: ExtraFieldsProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  return (
    <fieldset>
      <legend>Additional fields</legend>
      {fields.map((field, index) => (
        <div className={styles.inputGroup} key={field.id}>
          <Input
            label={field.name}
            {...register(`extraFields.${index}.value`)}
            error={errors.extraFields && errors.extraFields[index]?.message}
          />
          <Button variant="ghost" size="sm" onClick={() => remove(index)}>
            <TiTimes />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.addBtn}
        onClick={() => append({ name: "", type: "" })}
        type="button"
      >
        <TiPlus />
        Add
      </Button>
    </fieldset>
  );
}

type PassItemProps = {
  onSubmit: (data: FormValues) => void;
  serverError?: string;
  defaultValues?: Partial<FormValues>;
};

export default function PassItemForm({ onSubmit, serverError, defaultValues }: PassItemProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
      <fieldset>
        <Input label="Title" {...register("title")} error={errors.title?.message} />
      </fieldset>

      <fieldset>
        <Input
          label="Username / Email"
          {...register("username")}
          error={errors.username?.message}
        />

        <Input label="Password" {...register("password")} error={errors.password?.message} />

        <Input label="2FA secret key (TOTP)" {...register("totp")} error={errors.totp?.message} />
      </fieldset>

      <WebsiteFields control={control} register={register} errors={errors} />

      <fieldset>
        <Input label="Note (TODO: textarea)" {...register("note")} error={errors.note?.message} />
      </fieldset>

      <ExtraFields control={control} register={register} errors={errors} />

      {serverError && <p className={styles.error}>{serverError}</p>}

      <div className={styles.actions}>
        <ButtonLink variant="secondary" href={"/"}>
          <TiCancel />
          Cancel
        </ButtonLink>
        <Button type="submit">
          <TiUpload />
          Save
        </Button>
      </div>
    </form>
  );
}
