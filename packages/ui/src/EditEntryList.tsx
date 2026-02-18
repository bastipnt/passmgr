import type { FieldError, FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { getAttrsForName } from "./utils/label-mapping";
import { useId } from "react";
import styles from "./EditEntryList.module.css";

type EditEntryListProps<T extends FieldValues> = {
  items: { name: Path<T> }[];
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

function EditEntryList<T extends FieldValues>({ items, register, errors }: EditEntryListProps<T>) {
  return (
    <ul className={styles.editEntryList}>
      {items.map(({ name }) => {
        const { Icon, label } = getAttrsForName(name);
        const id = useId();
        const errorId = useId();
        const error = errors[name] as FieldError;

        return (
          <li key={name} className={styles.item}>
            <span className={styles.iconWrapper}>{Icon}</span>
            <div className={styles.labelRow}>
              <label htmlFor={id} className={styles.label}>
                {label}
              </label>
              {error && (
                <p id={errorId}>
                  <small className={styles.errorMessage}>{error.message}</small>
                </p>
              )}
            </div>
            <input
              {...register(name)}
              aria-errormessage={errorId}
              type="text"
              id={id}
              className={styles.input}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default EditEntryList;
