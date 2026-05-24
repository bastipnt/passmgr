import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Button, Main, Text } from "tamagui";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <Main p="$4">
      <Text fontSize="$xl">Record ID: {recordId}</Text>
      <Text fontSize="$xl">Path: {pathname}</Text>
      <Button onPress={() => router.back()}>Close</Button>
      <Button onPress={() => router.navigate(`/${recordId as string}/edit`)}>Edit</Button>
    </Main>
  );
}
