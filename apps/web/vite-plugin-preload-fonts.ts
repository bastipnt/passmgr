import type { Plugin } from "vite";

/**
 * Preloads the given emitted fonts from index.html, so they download alongside the CSS instead
 * of after it (the browser only finds them once the stylesheet is parsed). `names` match the
 * file name before Vite's content hash.
 */
export function preloadFonts(names: string[]): Plugin {
  let base = "/";
  return {
    name: "preload-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        const files = Object.keys(bundle ?? {});
        return names.map((name) => {
          const file = files.find((f) => f.endsWith(".woff2") && f.includes(`/${name}-`));
          if (!file) throw new Error(`preload-fonts: no emitted font named ${name}`);
          return {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              href: `${base}${file}`,
              crossorigin: "",
            },
            injectTo: "head",
          };
        });
      },
    },
  };
}
