import Animated from "react-native-reanimated";
import { withUniwind } from "uniwind";

/** Reanimated's `Animated.View` with `className`: Uniwind only styles core RN components. */
export const AnimatedView = withUniwind(Animated.View);
