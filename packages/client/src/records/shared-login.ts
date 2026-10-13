import type { LoginFormValues } from "@repo/schema";
import { websiteHost, websiteUrl } from "@repo/util";

const LINK = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/i;

/** The website in what another app shared: a page URL, or text with a link in it. */
export function sharedWebsite(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/\s/.test(trimmed)) return websiteUrl(trimmed);
  return websiteUrl(trimmed.match(LINK)?.[0] ?? "");
}

/** A new login for a website, titled by its host. */
export function newLoginValues(website: string): Partial<LoginFormValues> {
  return { title: websiteHost(website) ?? website, websites: [{ value: website }] };
}
