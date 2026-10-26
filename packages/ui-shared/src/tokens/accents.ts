/** Accent presets, in picker order. Web styles: `presets.css` (`data-accent`). */
export const ACCENT_PRESETS = ["berry", "violet", "cobalt", "pine", "ember", "graphite"] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export const DEFAULT_ACCENT: AccentPreset = "berry";

export const ACCENT_LABELS: Record<AccentPreset, string> = {
  berry: "Berry",
  violet: "Violet",
  cobalt: "Cobalt",
  pine: "Pine",
  ember: "Ember",
  graphite: "Graphite",
};

/** A stored value that is unknown (or a preset since removed) falls back to the default. */
export function parseAccent(value: unknown): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset === value) ?? DEFAULT_ACCENT;
}
