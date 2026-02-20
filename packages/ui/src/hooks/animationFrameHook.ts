import { isDefined } from "@repo/util";
import { useEffect, useRef } from "react";

const cbType = ["1s", "30s", "100ms"] as const;

type CallbackResult = {
  type: (typeof cbType)[number];
  deltaMs: number;
};

// TODO: refactor
export const useAnimationFrame = (cb: (res: CallbackResult) => void) => {
  const requestRef = useRef<number>(undefined);

  const previousFullHalf = useRef<number>(undefined);
  const previousFullSecond = useRef<number>(undefined);
  const previousFull100Ms = useRef<number>(undefined);

  const animate = async () => {
    const time = Date.now();
    const rounded100MsTime = Math.floor(time / 100) * 100;
    const deltaMs = rounded100MsTime % (30 * 1_000);

    if (!isDefined(previousFull100Ms.current)) {
      previousFull100Ms.current = rounded100MsTime;
      cb({ type: "100ms", deltaMs });
    }

    if (!isDefined(previousFullSecond.current)) {
      previousFullSecond.current = rounded100MsTime;
      cb({ type: "1s", deltaMs });
    }

    if (!isDefined(previousFullHalf.current)) {
      previousFullHalf.current = rounded100MsTime;
      cb({ type: "30s", deltaMs });
    }

    if (rounded100MsTime % 100 === 0) {
      if (previousFull100Ms.current !== rounded100MsTime) {
        previousFull100Ms.current = rounded100MsTime;
        cb({ type: "100ms", deltaMs });
      }
    }

    if (rounded100MsTime % (30 * 1_000) === 0) {
      if (previousFullHalf.current !== rounded100MsTime + 100) {
        previousFullHalf.current = rounded100MsTime;
        cb({ type: "30s", deltaMs });
      }
    }

    if (rounded100MsTime % 1_000 === 0) {
      if (previousFullSecond.current !== rounded100MsTime) {
        previousFullSecond.current = rounded100MsTime;
        cb({ type: "1s", deltaMs });
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);
};
