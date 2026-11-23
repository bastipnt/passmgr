/**
 * The latin faces behind `--font-sans` / `--font-display` (styles/globals.css): the build
 * preloads them, the brand render embeds them. `file` is the woff2 in the package's `files/`.
 */
export const FONT_FACES = {
  sans: { pkg: "@fontsource-variable/dm-sans", file: "dm-sans-latin-wght-normal" },
  display: {
    pkg: "@fontsource-variable/bricolage-grotesque",
    file: "bricolage-grotesque-latin-wght-normal",
  },
} as const;
