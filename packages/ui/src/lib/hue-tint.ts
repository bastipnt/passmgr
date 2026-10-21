import type { CSSProperties } from "react";

/** A tile tinted with a hue at the avatar fallback's lightness and chroma (light + dark). */
export function hueTint(hue: number): CSSProperties {
  return {
    backgroundColor: `oklch(var(--avatar-fallback-l-bg) var(--avatar-fallback-c-bg) ${hue})`,
    color: `oklch(var(--avatar-fallback-l-fg) var(--avatar-fallback-c-fg) ${hue})`,
  };
}
