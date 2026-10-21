import { hashString, websiteHost } from "@repo/util";
import { useEffect, useState } from "react";
import { loadImage } from "../utils/load-image";

type Website = { value: string };

type Status = "loading" | "ok" | "fail";

function faviconUrl(websites: Website[] | undefined): string | null {
  const host = websites?.map(({ value }) => websiteHost(value)).find(Boolean);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
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

  const hue = hashString(title) % 360;

  return {
    hue,
    status,
    src,
  };
}
