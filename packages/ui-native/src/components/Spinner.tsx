import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";

// `colorClassName` is Uniwind's way of driving a native color prop from a
// Tailwind color class — here the ActivityIndicator spinner color.
export function Spinner({ colorClassName = "text-primary", ...props }: ActivityIndicatorProps) {
  return <ActivityIndicator colorClassName={colorClassName} {...props} />;
}
