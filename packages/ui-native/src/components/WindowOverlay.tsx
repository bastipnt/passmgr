import { type ComponentProps, createContext, useContext } from "react";
import { FullWindowOverlay } from "react-native-screens";

const InWindowOverlayContext = createContext(false);

/**
 * `FullWindowOverlay` (iOS) that tells the components inside it where they are: its container
 * hangs off the `UIWindow`, so a SwiftUI host there finds no view controller and never mounts.
 */
export function WindowOverlay(props: ComponentProps<typeof FullWindowOverlay>) {
  return (
    <InWindowOverlayContext value>
      <FullWindowOverlay {...props} />
    </InWindowOverlayContext>
  );
}

/** True inside a `WindowOverlay`: render RN views there, not SwiftUI hosts. */
export function useInWindowOverlay() {
  return useContext(InWindowOverlayContext);
}
