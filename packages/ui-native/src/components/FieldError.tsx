import { Text, YStack } from "tamagui";

export type FieldErrorProps = {
  errors: { message: string }[];
};

export function FieldError({ errors }: FieldErrorProps) {
  if (errors.length === 0) return null;

  return (
    <YStack gap="$xs" marginTop="$xs">
      {errors.map((e, i) => (
        <Text key={i} fontSize="$sm" color="$destructive">
          {e.message}
        </Text>
      ))}
    </YStack>
  );
}
