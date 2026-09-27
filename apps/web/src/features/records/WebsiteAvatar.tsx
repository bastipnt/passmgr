import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { useWebsiteAvatar } from "@repo/ui-shared";
import { type CSSProperties } from "react";

type Website = { value: string };

type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
  size?: "default" | "lg";
};

/** Site favicon on a white rounded tile, or a hue-tinted initial. */
export function WebsiteAvatar({ title, websites, size = "default" }: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });

  const fallbackStyle: CSSProperties = {
    backgroundColor: `oklch(var(--avatar-fallback-l-bg) var(--avatar-fallback-c-bg) ${hue})`,
    color: `oklch(var(--avatar-fallback-l-fg) var(--avatar-fallback-c-fg) ${hue})`,
  };

  return (
    <Avatar
      className={
        size === "lg"
          ? "size-14 rounded-2xl bg-white p-2.5 after:rounded-2xl"
          : "size-9 rounded-[10px] bg-white p-1.5 after:rounded-[10px]"
      }
    >
      {status === "ok" && src && <AvatarImage src={src} className="rounded-sm" />}
      <AvatarFallback
        style={fallbackStyle}
        className={
          size === "lg"
            ? "-m-2.5 size-14 rounded-2xl font-bold font-display text-2xl"
            : "-m-1.5 size-9 rounded-[10px] font-semibold"
        }
      >
        {title.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
