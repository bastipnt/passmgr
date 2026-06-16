import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Button, Main, Text } from "tamagui";

export default function EditScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <Main>
      <Text fontSize="$lg">Edit ID: {recordId}</Text>
      <Text fontSize="$lg">Path: {pathname}</Text>
      <Button onPress={() => router.back()}>Close</Button>
    </Main>
  );
}
