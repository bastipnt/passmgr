import { useEffect, useState } from "react";
import { loadImage } from "../utils/load-image";

type Website = { value: string };

type Status = "loading" | "ok" | "fail";

function faviconUrl(websites: Website[] | undefined): string | null {
  const first = websites?.find((w) => w.value !== "");
  if (!first) return null;
  try {
    const { hostname } = new URL(first.value);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return null;
  }
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function useWebsiteAvatar({
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
    loadImage(src)
      .then(setStatus)
      .catch(() => setStatus("fail"));
  }, [src]);

  const hue = hashHue(title);

  return {
    hue,
    status,
    src,
  };
}
