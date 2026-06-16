import Record from "@/features/records/components/Record";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Main, ScrollView } from "tamagui";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  // const pathname = usePathname();

  return (
    <ScrollView>
      <Button onPress={() => router.navigate(`/${recordId as string}/edit`)}>Edit</Button>
      <Main p="$4" bg="$background08" flex={1}>
        {/* <Text fontSize="$4">Record ID: {recordId}</Text>
        <Text fontSize="$4">Path: {pathname} hello</Text> */}
        {/* <Button onPress={() => router.back()}>Close</Button> */}
        <Record recordId={recordId} />
      </Main>
    </ScrollView>
  );
}
