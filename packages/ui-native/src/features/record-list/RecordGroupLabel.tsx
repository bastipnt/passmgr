import { Text, View } from "react-native";

type RecordGroupLabelProps = {
  text: string;
};

export function RecordGroupLabel({ text }: RecordGroupLabelProps) {
  return (
    <View className="bg-muted px-md py-sm">
      <Text className="font-semibold text-muted-foreground text-xs uppercase">{text}</Text>
    </View>
  );
}
