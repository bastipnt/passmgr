import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { colors } from "../theme/tokens";

export function Spinner(props: ActivityIndicatorProps) {
  return <ActivityIndicator color={colors.light.primary} {...props} />;
}
