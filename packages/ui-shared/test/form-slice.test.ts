import type { Control, UseFormSetValue } from "react-hook-form";
import { describe, expect, expectTypeOf, it } from "vitest";
import { formSlice } from "../src/form/form-slice";

type PasswordValues = { password?: string };
type LoginValues = { title: string; password?: string; username: string };

type FieldProps<T extends PasswordValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  label?: string;
};

const pinPassword = formSlice<PasswordValues>();

function field<T extends PasswordValues>(props: FieldProps<T>) {
  return pinPassword(props);
}

describe("formSlice", () => {
  it("returns the props it was given", () => {
    const props = {
      control: {} as Control<LoginValues>,
      setValue: (() => {}) as UseFormSetValue<LoginValues>,
      label: "Password",
    };

    expect(field(props)).toBe(props);
  });

  it("types the form parts by the slice, the rest as given", () => {
    const sliced = field({
      control: {} as Control<LoginValues>,
      setValue: (() => {}) as UseFormSetValue<LoginValues>,
    });

    expectTypeOf(sliced.control).toEqualTypeOf<Control<PasswordValues>>();
    expectTypeOf(sliced.setValue).toEqualTypeOf<UseFormSetValue<PasswordValues>>();
    expectTypeOf(sliced.label).toEqualTypeOf<string | undefined>();
  });

  it("rejects a form whose fields don't match the slice", () => {
    const pins = { control: {} as Control<{ password: number }> };

    // @ts-expect-error -- its `password` is a number, so the form can't take this slice.
    expect(pinPassword(pins)).toBe(pins);
  });
});
