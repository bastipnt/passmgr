import { useEffect } from "react";

const SITE_URL = import.meta.env.VITE_SITE_URL?.replace(/\/+$/, "");

type PageMetaProps = {
  /** Page name; rendered as "<title> · passmgr". */
  title?: string;
  description?: string;
  /** Route path for the canonical link. Only emitted when VITE_SITE_URL is set. */
  canonicalPath?: string;
  /** Keep crawlers off pages behind login or with one-off flows. */
  noindex?: boolean;
};

/**
 * Per-route head tags. index.html already carries a <title> and description,
 * so those are updated in place (a second hoisted <title> would lose to the
 * first); canonical and robots don't exist there and use React 19 hoisting.
 */
export function PageMeta({ title, description, canonicalPath, noindex }: PageMetaProps) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · passmgr`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description || !tag) return;
    const previous = tag.content;
    tag.content = description;
    return () => {
      tag.content = previous;
    };
  }, [description]);

  return (
    <>
      {SITE_URL && canonicalPath && <link rel="canonical" href={`${SITE_URL}${canonicalPath}`} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </>
  );
}
