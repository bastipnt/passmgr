import { useNavigation } from "expo-router";
import { useEffect, useRef } from "react";

/** Pops the stack to its root when its tab loses focus; `onBlur` runs alongside the reset. */
export function useResetStackOnTabBlur(onBlur?: () => void) {
  const navigation = useNavigation();

  // Kept in a ref so a fresh callback each render doesn't resubscribe.
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  useEffect(() => {
    // The parent tab, not the screen: pushing a record blurs the screen too, undoing the push.
    const tab = navigation.getParent();
    if (!tab) return;

    return tab.addListener("blur", () => {
      onBlurRef.current?.();

      // Nothing pushed on top — dispatching anyway logs "the action 'POP_TO_TOP'
      // was not handled by any navigator".
      const state = navigation.getState();
      if (!state || state.routes.length <= 1) return;

      // `StackActions.popToTop()`, which expo-router does not re-export. `target`
      // keeps it from bubbling up to the tab navigator.
      navigation.dispatch({ type: "POP_TO_TOP", target: state.key });
    });
  }, [navigation]);
}
