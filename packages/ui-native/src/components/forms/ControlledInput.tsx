import { type ReactNode } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Text, TextInput, type TextInputProps, View } from "react-native";

import { cn } from "../../lib/utils";

export type InputProps = TextInputProps & {
  label?: string;
  hideLabel?: boolean;
  error?: string;
  /** Rendered below the input — e.g. a strength meter or a "Forgot password?" link. */
  note?: ReactNode;
  /** Rendered at the trailing edge inside the field — e.g. a password eye toggle. */
  addon?: ReactNode;
  /** Extra classes for the `TextInput` itself — e.g. wider padding for a two-icon addon. */
  inputClassName?: string;
  icon?: ReactNode;
  className?: string;
};

export function Input({
  label,
  hideLabel,
  error,
  note,
  addon,
  inputClassName,
  className: _className,
  style: _style,
  ...rest
}: InputProps) {
  return (
    <View className="flex-auto gap-2">
      {label && !hideLabel && <Text className="font-bold text-foreground text-md">{label}</Text>}

      <View className="relative flex-row items-center">
        <TextInput
          className={cn(
            "h-[52px] flex-1 rounded-lg border-[1.5px] bg-background px-md text-foreground text-md",
            error
              ? "border-destructive focus:border-destructive"
              : "border-border focus:border-primary",
            addon && "pr-[46px]",
            inputClassName,
          )}
          placeholderTextColorClassName="text-muted-foreground"
          {...rest}
        />
        {addon && (
          <View className="absolute inset-y-0 right-[12px] items-center justify-center">
            {addon}
          </View>
        )}
      </View>

      {error && <Text className="text-destructive text-sm">{error}</Text>}

      {note}
    </View>
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
  icon,
  ...rest
}: ControlledInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldContent = (
          <Input
            value={(field.value as string | undefined) ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            {...rest}
          />
        );

        if (icon) {
          return (
            <View className="flex-row items-start gap-2">
              <View className="shrink-0 pt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</View>
              {fieldContent}
            </View>
          );
        }

        return fieldContent;
      }}
    />
  );
}
