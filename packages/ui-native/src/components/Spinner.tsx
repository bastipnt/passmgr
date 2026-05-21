import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";

export function Spinner(props: ActivityIndicatorProps) {
  return <ActivityIndicator color="#0a84ff" {...props} />;
}
