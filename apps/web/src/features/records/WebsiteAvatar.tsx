import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { useWebsiteAvatar } from "@repo/ui-shared";
import { type CSSProperties } from "react";

type Website = { value: string };

type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
  size?: "default" | "md" | "lg";
};

const SIZES = {
  default: {
    tile: "size-9 rounded-[10px] bg-white p-1.5 after:rounded-[10px]",
    fallback: "-m-1.5 size-9 rounded-[10px] font-semibold",
  },
  md: {
    tile: "size-[2.625rem] rounded-xl bg-white p-2 after:rounded-xl",
    fallback: "-m-2 size-[2.625rem] rounded-xl font-semibold text-lg",
  },
  lg: {
    tile: "size-14 rounded-2xl bg-white p-2.5 after:rounded-2xl",
    fallback: "-m-2.5 size-14 rounded-2xl font-bold font-display text-2xl",
  },
} as const;

/** Site favicon on a white rounded tile, or a hue-tinted initial. */
export function WebsiteAvatar({ title, websites, size = "default" }: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });
  const { tile, fallback } = SIZES[size];

  const fallbackStyle: CSSProperties = {
    backgroundColor: `oklch(var(--avatar-fallback-l-bg) var(--avatar-fallback-c-bg) ${hue})`,
    color: `oklch(var(--avatar-fallback-l-fg) var(--avatar-fallback-c-fg) ${hue})`,
  };

  return (
    <Avatar className={tile}>
      {status === "ok" && src && <AvatarImage src={src} className="rounded-sm" />}
      <AvatarFallback style={fallbackStyle} className={fallback}>
        {title.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
