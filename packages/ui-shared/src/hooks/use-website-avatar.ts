import { hashString, websiteHost } from "@repo/util";
import { createContext, useContext, useEffect, useState } from "react";
import { loadImage } from "../utils/load-image";

type Website = { value: string };

type Status = "loading" | "ok" | "fail";

export const WEBSITE_ICONS_HINT =
  "Fetches each site's icon from DuckDuckGo, which then learns the host names of your saved logins.";

/** Off unless the user opted in: every favicon lookup sends the login's host to DuckDuckGo. */
export const WebsiteIconsContext = createContext(false);

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
  const enabled = useContext(WebsiteIconsContext);
  const src = enabled ? faviconUrl(websites) : null;
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
