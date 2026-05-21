import { Text, View } from "../lib/styled";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <View className="gap-1 mt-1">
      {errors.map((e, i) => (
        <Text key={i} className="text-sm text-danger">
          {e.message}
        </Text>
      ))}
    </View>
  );
}
