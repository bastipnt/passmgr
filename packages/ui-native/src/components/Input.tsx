import { type TextInputProps } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Input as TInput, Text, YStack } from "tamagui";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  className?: string;
};

export function Input({ label, error, className: _className, style: _style, ...rest }: InputProps) {
  return (
    <YStack gap="$xs">
      {label && (
        <Text fontSize="$sm" fontWeight="500" color="$foreground">
          {label}
        </Text>
      )}
      <TInput
        borderWidth={1}
        borderRadius="$md"
        paddingHorizontal="$md"
        paddingVertical="$sm"
        minHeight={44}
        fontSize="$md"
        color="$foreground"
        backgroundColor="$background"
        borderColor={error ? "$destructive" : "$border"}
        focusStyle={error ? undefined : { borderColor: "$ring" }}
        placeholderTextColor="$mutedForeground"
        {...(rest as Record<string, unknown>)}
      />
      {error && (
        <Text fontSize="$xs" color="$destructive">
          {error}
        </Text>
      )}
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
