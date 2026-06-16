import { Text, View } from "tamagui";

type RecordGroupLabelProps = {
  text: string;
};

export function RecordGroupLabel({ text }: RecordGroupLabelProps) {
  return (
    <View p="$md" bg="$accent10">
      <Text>{text}</Text>
    </View>
  );
}
