import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Button, Main, Text } from "tamagui";

export default function EditScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <Main>
      <Text fontSize="$6">Edit ID: {recordId}</Text>
      <Text fontSize="$6">Path: {pathname}</Text>
      <Button onPress={() => router.back()}>Close</Button>
    </Main>
  );
}
