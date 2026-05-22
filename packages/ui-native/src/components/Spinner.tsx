import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useTheme } from "tamagui";

export function Spinner(props: ActivityIndicatorProps) {
  const theme = useTheme();
  return <ActivityIndicator color={theme.primary?.val} {...props} />;
}
