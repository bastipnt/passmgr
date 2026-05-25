import Record from "@/features/records/components/Record";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Button, Main, Text, YStack } from "tamagui";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <Main p="$4" bg="$background08" flex={1}>
      <YStack gap="$4">
        <Text fontSize="$4">Record ID: {recordId}</Text>
        <Text fontSize="$4">Path: {pathname} hello</Text>
        <Button onPress={() => router.back()}>Close</Button>
        <Button onPress={() => router.navigate(`/${recordId as string}/edit`)}>Edit</Button>
        <Record recordId={recordId} />
      </YStack>
    </Main>
  );
}
