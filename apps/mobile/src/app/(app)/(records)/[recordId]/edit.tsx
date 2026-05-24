import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Button, Main, Text } from "tamagui";

export default function EditScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <Main>
      <Text fontSize="$xl">Edit ID: {recordId}</Text>
      <Text fontSize="$xl">Path: {pathname}</Text>
      <Button onPress={() => router.back()}>Close</Button>
    </Main>
  );
}
