import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { recordPaths } from "@/route-paths";

let unlocked = false;
let held: Href | undefined;

/**
 * Where a share's new login goes: straight there when unlocked, else home (the
 * protected routes would drop it) with the login held until the unlock.
 */
export function routeSharedLogin(href: Href): Href {
  if (unlocked) return href;
  held = href;
  return recordPaths.index;
}

/** Mounted with the unlocked tree. */
export function useOpenSharedLogin() {
  const router = useRouter();

  useEffect(() => {
    unlocked = true;
    const href = held;
    held = undefined;
    if (href) router.push(href);
    return () => {
      unlocked = false;
    };
  }, [router]);
}
