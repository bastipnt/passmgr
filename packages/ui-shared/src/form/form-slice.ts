import type {
  Control,
  FieldErrors,
  FieldValues,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

/** The react-hook-form handles a field component takes from its parent form. */
export type FormParts<T extends FieldValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

type FormSliceProps<P, S extends FieldValues> = {
  [K in keyof P]: K extends keyof FormParts<S> ? FormParts<S>[K] : P[K];
};

/**
 * Pins a generic field component's form handles to the slice `S` of the form it touches:
 * `formSlice<{ password?: string }>()(props)` gives a `Control<{ password?: string }>` & co.
 */
export function formSlice<S extends FieldValues>() {
  return <T extends S, P extends Partial<FormParts<T>>>(
    props: P & Partial<FormParts<T>>,
  ): FormSliceProps<P, S> =>
    // react-hook-form's paths don't narrow through a generic `T`; `T extends S` makes the
    // slice's paths valid on the caller's form, so only the handles' types are widened.
    props as unknown as FormSliceProps<P, S>;
}
