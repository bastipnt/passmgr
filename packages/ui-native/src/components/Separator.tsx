import { View, type ViewProps } from "react-native";
import { cn } from "../lib/utils";

/**
 * Hairline rule. A plain `View`, not SwiftUI's `Divider`: a SwiftUI view
 * mounted outside a `<Host>` aborts the app on iOS as soon as UIKit probes the
 * hierarchy for a first responder (e.g. focusing a field next to it).
 */
function Separator({ className, ...props }: ViewProps) {
  return <View className={cn("h-px bg-foreground/8 dark:bg-white/8", className)} {...props} />;
}

export { Separator };
