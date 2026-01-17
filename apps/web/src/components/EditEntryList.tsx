import type { FieldError, FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { getAttrsForName } from "../utils/label-mapping";
import { cn } from "../utils/tailwind";
import { useId } from "react";

type EditEntryListProps<T extends FieldValues> = {
  items: { name: Path<T> }[];
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

function EditEntryList<T extends FieldValues>({ items, register, errors }: EditEntryListProps<T>) {
  return (
    <ul className="bg-surface-2 rounded border">
      {items.map(({ name }) => {
        const { Icon, label } = getAttrsForName(name);
        const id = useId();
        const errorId = useId();
        const error = errors[name] as FieldError;

        return (
          <li
            key={name}
            className={cn(
              "grid w-full grid-flow-col grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-4 px-4 py-2 text-left",
              "not-last:border-b",
              "[&_svg]:text-2xl",
            )}
          >
            <span className="row-span-2">{Icon}</span>
            <div className="flex w-full flex-row items-center gap-4">
              <label htmlFor={id} className="text-content-secondary text-xs">
                {label}
              </label>
              {error && (
                <p id={errorId}>
                  <small className="text-error-content">{error.message}</small>
                </p>
              )}
            </div>
            <input
              {...register(name)}
              aria-errormessage={errorId}
              type="text"
              id={id}
              className={cn(
                "block w-full rounded p-0",
                "focus-visible:ring-primary-900 transition-colors focus-visible:ring-2 focus-visible:outline-none",
              )}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default EditEntryList;
