import { Text, YStack } from "tamagui";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <YStack gap="$1" mt="$0.5">
      {errors.map((e, i) => (
        <Text key={i} fontSize="$2" color="$destructive">
          {e.message}
        </Text>
      ))}
    </YStack>
  );
}
