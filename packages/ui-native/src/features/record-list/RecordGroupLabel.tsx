import { View, Text } from "react-native";

type RecordGroupLabelProps = {
  text: string;
};

export function RecordGroupLabel({ text }: RecordGroupLabelProps) {
  return (
    <View className="bg-muted px-md py-sm">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">{text}</Text>
    </View>
  );
}
