/** Accent presets, in picker order. Web styles: `presets.css` (`data-accent`). */
export const ACCENT_PRESETS = ["berry", "violet", "cobalt", "pine", "ember", "graphite"] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export type ColorMode = "light" | "dark";

export const DEFAULT_ACCENT: AccentPreset = "berry";

export const ACCENT_LABELS: Record<AccentPreset, string> = {
  berry: "Berry",
  violet: "Violet",
  cobalt: "Cobalt",
  pine: "Pine",
  ember: "Ember",
  graphite: "Graphite",
};

export const ACCENT_HINT =
  "Logo, buttons, selection and links use the accent. Green, amber and red keep their meaning in every option.";

/** A stored value that is unknown (or a preset since removed) falls back to the default. */
export function parseAccent(value: unknown): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset === value) ?? DEFAULT_ACCENT;
}

export type AccentColors = {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  "muted-foreground": string;
  field: string;
  primary: string;
  "primary-foreground": string;
  "primary-text": string;
};

/** The values of `presets.css`, for native; test/presets.test.ts keeps both equal. */
export const ACCENT_COLORS: Record<AccentPreset, Record<ColorMode, AccentColors>> = {
  berry: {
    light: {
      background: "#f5f1f3",
      foreground: "#1e141a",
      card: "#ffffff",
      muted: "#ece5e9",
      "muted-foreground": "#6e5e67",
      field: "#f2edf0",
      primary: "#b4307a",
      "primary-foreground": "#ffffff",
      "primary-text": "#93245f",
    },
    dark: {
      background: "#141013",
      foreground: "#f5eef2",
      card: "#1e181c",
      muted: "#2a2228",
      "muted-foreground": "#b4a6ae",
      field: "#272026",
      primary: "#d04a93",
      "primary-foreground": "#141013",
      "primary-text": "#f49acb",
    },
  },
  violet: {
    light: {
      background: "#f3f2f7",
      foreground: "#181522",
      card: "#ffffff",
      muted: "#e8e6ef",
      "muted-foreground": "#656075",
      field: "#efeef5",
      primary: "#664cf4",
      "primary-foreground": "#ffffff",
      "primary-text": "#4b33d6",
    },
    dark: {
      background: "#0f0e15",
      foreground: "#f0effa",
      card: "#181620",
      muted: "#22202e",
      "muted-foreground": "#aaa7be",
      field: "#201e2b",
      primary: "#8b78ff",
      "primary-foreground": "#0f0e15",
      "primary-text": "#c3b4ff",
    },
  },
  cobalt: {
    light: {
      background: "#eef1f6",
      foreground: "#101825",
      card: "#ffffff",
      muted: "#e1e6ef",
      "muted-foreground": "#586479",
      field: "#e9edf4",
      primary: "#2f5bea",
      "primary-foreground": "#ffffff",
      "primary-text": "#1f45c6",
    },
    dark: {
      background: "#0d1117",
      foreground: "#ebf1fa",
      card: "#141a22",
      muted: "#1d2531",
      "muted-foreground": "#9facbf",
      field: "#1b222d",
      primary: "#5b82ff",
      "primary-foreground": "#0d1117",
      "primary-text": "#a9c0ff",
    },
  },
  pine: {
    light: {
      background: "#f2f1ec",
      foreground: "#1b1809",
      card: "#ffffff",
      muted: "#e8e6dd",
      "muted-foreground": "#68644e",
      field: "#efede7",
      primary: "#0e7668",
      "primary-foreground": "#ffffff",
      "primary-text": "#0b6357",
    },
    dark: {
      background: "#0e1412",
      foreground: "#eaf3f0",
      card: "#151d1b",
      muted: "#1d2925",
      "muted-foreground": "#9dafa9",
      field: "#1b2723",
      primary: "#2bb39f",
      "primary-foreground": "#0e1412",
      "primary-text": "#7fe0cf",
    },
  },
  ember: {
    light: {
      background: "#f6f2ee",
      foreground: "#20150a",
      card: "#ffffff",
      muted: "#eee6df",
      "muted-foreground": "#71604f",
      field: "#f3eee9",
      primary: "#c0400c",
      "primary-foreground": "#ffffff",
      "primary-text": "#9a3412",
    },
    dark: {
      background: "#15110e",
      foreground: "#f5efea",
      card: "#1f1915",
      muted: "#2c241e",
      "muted-foreground": "#b5a89f",
      field: "#29211c",
      primary: "#f0773e",
      "primary-foreground": "#15110e",
      "primary-text": "#ffb48c",
    },
  },
  graphite: {
    light: {
      background: "#ededf0",
      foreground: "#17171f",
      card: "#ffffff",
      muted: "#e2e2e7",
      "muted-foreground": "#62626e",
      field: "#e9e9ed",
      primary: "#18181b",
      "primary-foreground": "#ffffff",
      "primary-text": "#18181b",
    },
    dark: {
      background: "#18181b",
      foreground: "#f0f0f4",
      card: "#212125",
      muted: "#2c2c32",
      "muted-foreground": "#aaaab3",
      field: "#29292f",
      primary: "#e4e4e7",
      "primary-foreground": "#18181b",
      "primary-text": "#fafafa",
    },
  },
};

type Rgb = [r: number, g: number, b: number];

const hexToRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];

const channelHex = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** `color-mix(in oklab, <hex> <weight>, #000)`: black is the oklab origin, so the mix scales Lab. */
function darken(hex: string, weight: number): string {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) * weight;
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) * weight;
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) * weight;
  const [l3, m3, s3] = [l ** 3, m ** 3, s ** 3];
  return `#${[
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
    .map((v) => channelHex(fromLinear(v)))
    .join("")}`;
}

/** `color-mix(in oklab, <hex> <alpha>, transparent)`. */
const withAlpha = (hex: string, alpha: number) => `${hex}${channelHex(alpha)}`;

/**
 * Every `--color-*` a preset sets in one mode, derived the way `presets.css` derives them
 * (`destructive` and the status colors are not part of a preset). Native applies it at runtime.
 */
export function accentVariables(preset: AccentPreset, mode: ColorMode): Record<string, string> {
  const c = ACCENT_COLORS[preset][mode];
  const colors = {
    ...c,
    "card-foreground": c.foreground,
    popover: c.card,
    "popover-foreground": c.foreground,
    secondary: c.card,
    "secondary-foreground": c.foreground,
    accent: c.muted,
    "accent-foreground": c.foreground,
    border: withAlpha(c.foreground, 0.1),
    input: withAlpha(c.foreground, 0.13),
    ring: c.primary,
    "primary-pressed": darken(c.primary, 0.85),
    "edge-tint": c.background,
  };
  return Object.fromEntries(Object.entries(colors).map(([name, hex]) => [`--color-${name}`, hex]));
}
