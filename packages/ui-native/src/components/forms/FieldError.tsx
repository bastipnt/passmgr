import { View, Text } from "react-native";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <View className="mt-xs gap-sm">
      {errors.map((e, i) => (
        <Text key={i} className="text-md text-destructive">
          {e.message}
        </Text>
      ))}
    </View>
  );
}
