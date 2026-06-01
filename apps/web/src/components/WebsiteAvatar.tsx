import { type CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { useWebsiteAvatar } from "@repo/tokens";

type Website = { value: string };

type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
};

export function WebsiteAvatar({ title, websites }: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });

  const fallbackStyle: CSSProperties = {
    backgroundColor: `oklch(var(--avatar-fallback-l-bg) var(--avatar-fallback-c-bg) ${hue})`,
    color: `oklch(var(--avatar-fallback-l-fg) var(--avatar-fallback-c-fg) ${hue})`,
  };

  return (
    <Avatar>
      {status === "ok" && src && <AvatarImage src={src} />}
      <AvatarFallback style={fallbackStyle}>{title.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}
