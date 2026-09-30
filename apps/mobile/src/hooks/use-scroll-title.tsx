import { useScrollToTop } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useRef, useState } from "react";
import { Platform, View } from "react-native";
import type Animated from "react-native-reanimated";
import { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const IOS = Platform.OS === "ios";

/**
 * Drives web's collapsing page title under a transparent native header: the
 * screen renders its big title in the content, and once that has scrolled
 * `threshold` px under the bar, `titleInBar` flips so the header can show it.
 *
 * `scrollY` is the content offset measured from the bar's bottom edge — 0 at
 * rest on both platforms. iOS insets the scroll view by the transparent
 * header itself (`contentInsetAdjustmentBehavior`), so it rests at
 * -headerHeight; Android has no such inset, so the content pads itself with
 * `contentTopPadding` and rests at 0.
 *
 * Spread `scrollProps` onto a reanimated `Animated.ScrollView`. Tapping the
 * active tab scrolls back to the real top (RN's own scroll-to-top targets
 * offset 0, which on iOS leaves the title under the bar).
 */
export function useScrollTitle(threshold: number) {
  const headerHeight = useHeaderHeight();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const anchorRef = useRef<View>(null);
  const measured = useRef(false);
  /*
   * Offset the scroll view rests at. On iOS that is minus the inset UIKit adds
   * for the transparent bar, which `useHeaderHeight` only estimates (it runs
   * ~12pt short of the iOS 26 bar), so it is measured once at mount from where
   * the first piece of content lands on screen.
   */
  const restOffset = useSharedValue(IOS ? -headerHeight : 0);

  const measureRest = useCallback(() => {
    if (!IOS || measured.current) return;
    measured.current = true;
    // Next frame: the first layout pass lands before UIKit applies the inset.
    requestAnimationFrame(() => {
      const scrollView = scrollRef.current?.getNativeScrollRef();
      const anchor = anchorRef.current;
      if (!scrollView || !anchor) return;
      scrollView.measureInWindow((_x, scrollTop) => {
        anchor.measureInWindow((_ax, anchorTop) => {
          const inset = anchorTop - scrollTop;
          if (inset > 0) restOffset.value = -inset;
        });
      });
    });
  }, [scrollRef, restOffset]);
  const scrollY = useSharedValue(0);
  const inBar = useSharedValue(false);
  const [titleInBar, setTitleInBar] = useState(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y - restOffset.value;
    scrollY.value = y;
    const next = y > threshold;
    if (next !== inBar.value) {
      inBar.value = next;
      scheduleOnRN(setTitleInBar, next);
    }
  });

  const scrollToTop = useCallback(
    (animated = true) => scrollRef.current?.scrollTo({ y: restOffset.value, animated }),
    [scrollRef, restOffset],
  );

  // `useScrollToTop` prefers a `scrollToTop()` method over `scrollTo({ y: 0 })`.
  const tabTopRef = useRef({ scrollToTop: () => scrollToTop() });
  tabTopRef.current.scrollToTop = () => scrollToTop();
  useScrollToTop(tabTopRef);

  return {
    scrollY,
    titleInBar,
    scrollToTop,
    /** Android only: room for the transparent header iOS insets for us. */
    contentTopPadding: IOS ? 0 : headerHeight,
    /**
     * Render as the scroll content's first child (zero-size): measures where
     * the content rests under the bar.
     */
    restAnchor: <View ref={anchorRef} onLayout={measureRest} pointerEvents="none" />,
    scrollProps: {
      ref: scrollRef,
      onScroll,
      scrollEventThrottle: 16,
      contentInsetAdjustmentBehavior: "automatic" as const,
      // RN clamps `scrollTo` to offsets >= 0; the iOS rest offset is negative.
      scrollToOverflowEnabled: true,
    },
  };
}
