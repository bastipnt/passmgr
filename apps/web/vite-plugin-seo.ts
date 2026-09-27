import type { HtmlTagDescriptor, Plugin } from "vite";

/**
 * Only the public entry pages are indexable; everything else is behind login.
 * Mirrors `authPaths.login` / `authPaths.register` in src/app/route-paths.ts.
 */
const PUBLIC_PATHS = ["/login", "/register"];

const OG_IMAGE = "/og-image.png";

/**
 * Emits robots.txt (and sitemap.xml) and adds the head tags that need an
 * absolute URL. `siteUrl` comes from VITE_SITE_URL; without it those tags and
 * the sitemap are skipped rather than emitted with relative URLs, which
 * crawlers and link-preview bots reject.
 */
export function seo(siteUrl: string | undefined): Plugin {
  const site = siteUrl?.replace(/\/+$/, "") || undefined;

  return {
    name: "seo",
    transformIndexHtml() {
      if (!site) return [];
      const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
        tag: "meta",
        attrs,
        injectTo: "head",
      });
      return [
        meta({ property: "og:url", content: `${site}/` }),
        meta({ property: "og:image", content: `${site}${OG_IMAGE}` }),
        meta({ name: "twitter:image", content: `${site}${OG_IMAGE}` }),
      ];
    },
    generateBundle() {
      const robots = [
        "User-agent: *",
        ...PUBLIC_PATHS.map((path) => `Allow: ${path}$`),
        // Crawlers must fetch the bundle to render the SPA, and preview bots
        // (Twitterbot) honour robots.txt for og:image.
        "Allow: /assets/",
        "Allow: /*.png$",
        "Allow: /favicon.svg$",
        "Allow: /manifest.webmanifest$",
        "Disallow: /",
        ...(site ? ["", `Sitemap: ${site}/sitemap.xml`] : []),
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });

      if (!site) return;
      const urls = PUBLIC_PATHS.map((path) => `  <url><loc>${site}${path}</loc></url>`);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
    },
  };
}
