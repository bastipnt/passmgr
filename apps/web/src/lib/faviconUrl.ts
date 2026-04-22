type Website = { value: string };

export function faviconUrl(websites: Website[] | undefined): string | null {
  const first = websites?.find((w) => w.value !== "");
  if (!first) return null;
  try {
    const { hostname } = new URL(first.value);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return null;
  }
}
