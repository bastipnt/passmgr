import { Text, View } from "tamagui";

type RecordGroupLabelProps = {
  text: string;
};

export function RecordGroupLabel({ text }: RecordGroupLabelProps) {
  return (
    <View p="$2" bg="$accent10">
      <Text>{text}</Text>
    </View>
  );
}
