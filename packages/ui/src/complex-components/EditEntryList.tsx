import type { FieldError, FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { getAttrsForName } from "../utils/label-mapping";
import { useId } from "react";

type EditEntryListProps<T extends FieldValues> = {
  items: { name: Path<T> }[];
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

function EditEntryList<T extends FieldValues>({ items, register, errors }: EditEntryListProps<T>) {
  return (
    <ul>
      {items.map(({ name }) => {
        const { Icon, label } = getAttrsForName(name);
        const id = useId();
        const errorId = useId();
        const error = errors[name] as FieldError;

        return (
          <li key={name}>
            <span>{Icon}</span>
            <div>
              <label htmlFor={id}>{label}</label>
              {error && (
                <p id={errorId}>
                  <small>{error.message}</small>
                </p>
              )}
            </div>
            <input {...register(name)} aria-errormessage={errorId} type="text" id={id} />
          </li>
        );
      })}
    </ul>
  );
}

export default EditEntryList;
