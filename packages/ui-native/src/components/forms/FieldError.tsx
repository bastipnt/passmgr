import { Text, YStack } from "tamagui";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <YStack gap="$sm" mt="$xs">
      {errors.map((e, i) => (
        <Text key={i} fontSize="$md" color="$destructive">
          {e.message}
        </Text>
      ))}
    </YStack>
  );
}
