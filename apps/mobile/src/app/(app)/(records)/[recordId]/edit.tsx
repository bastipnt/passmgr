import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { Button } from "@repo/ui-native";

export default function EditScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const pathname = usePathname();

  return (
    <View className="flex-1 gap-md bg-background p-md">
      <Text className="text-lg text-foreground">Edit ID: {recordId}</Text>
      <Text className="text-lg text-foreground">Path: {pathname}</Text>
      <Button onPress={() => router.back()}>Close</Button>
    </View>
  );
}
