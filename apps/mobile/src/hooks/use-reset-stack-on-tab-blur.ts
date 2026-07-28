import { useNavigation } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Pops this screen's stack back to its root whenever the tab hosting it loses
 * focus, so re-entering the tab always starts at the root screen instead of a
 * previously opened record.
 *
 * Listens on the parent (the tab this stack belongs to) rather than on the
 * screen itself: pushing a record blurs the screen too, and resetting there
 * would immediately undo the push.
 *
 * @param onBlur Extra cleanup to run alongside the reset.
 */
export function useResetStackOnTabBlur(onBlur?: () => void) {
  const navigation = useNavigation();

  // Kept in a ref so a fresh callback each render doesn't resubscribe.
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  useEffect(() => {
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
