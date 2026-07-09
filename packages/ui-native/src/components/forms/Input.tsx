import { type ReactNode } from "react";
import { type TextInputProps } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Input as TInput, Label, Text, XStack, YStack } from "tamagui";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  /** Rendered below the input — e.g. a strength meter or a "Forgot password?" link. */
  note?: ReactNode;
  /** Rendered at the trailing edge inside the field — e.g. a password eye toggle. */
  trailing?: ReactNode;
  className?: string;
};

export function Input({
  label,
  error,
  note,
  trailing,
  className: _className,
  style: _style,
  ...rest
}: InputProps) {
  return (
    <YStack gap="$xs">
      {label && (
        <Label lineHeight="$lg" fontWeight="$bold" color="$color">
          {label}
        </Label>
      )}

      <XStack items="center" position="relative">
        <TInput
          flex={1}
          height="$lg"
          borderWidth={1.5}
          bg="$white"
          pr={trailing ? 46 : undefined}
          borderColor={error ? "$destructive" : "$borderColor"}
          focusStyle={error ? { borderColor: "$destructive" } : { borderColor: "$primary" }}
          placeholderTextColor="$color005"
          {...(rest as Record<string, unknown>)}
        />
        {trailing && (
          <XStack position="absolute" r={12} t={0} b={0} items="center" justify="center">
            {trailing}
          </XStack>
        )}
      </XStack>

      {error && (
        <Text theme="error" fontSize="$sm" color="$destructive">
          {error}
        </Text>
      )}

      {note}
    </YStack>
  );
}

export type ControlledInputProps<TFieldValues extends FieldValues> = Omit<
  InputProps,
  "value" | "onChangeText" | "onBlur"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledInput<TFieldValues extends FieldValues>({
  control,
  name,
  ...rest
}: ControlledInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          value={(field.value as string | undefined) ?? ""}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}
