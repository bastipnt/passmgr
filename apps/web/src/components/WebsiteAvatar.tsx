import { useEffect, useState, type CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { faviconUrl } from "@/lib/faviconUrl";

type Website = { value: string };

type Status = "loading" | "ok" | "fail";

// DDG returns a 48x48 PNG placeholder when it has no favicon for the domain
// (despite responding with HTTP 404, the body is a valid PNG, so <img> fires
// `load` not `error`). Real favicons from DDG pass through at 16 or 32 px.
function isDdgPlaceholder(img: HTMLImageElement) {
  return img.naturalWidth === 48 && img.naturalHeight === 48;
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function WebsiteAvatar({
  title,
  websites,
}: {
  title: string;
  websites: Website[] | undefined;
}) {
  const src = faviconUrl(websites);
  const [status, setStatus] = useState<Status>(src ? "loading" : "fail");

  useEffect(() => {
    if (!src) {
      setStatus("fail");
      return;
    }
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus(isDdgPlaceholder(img) ? "fail" : "ok");
    img.onerror = () => setStatus("fail");
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  const hue = hashHue(title);
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
