/**
 * Mobile's embedded font families for raw native styles (test/native-fonts.test.ts checks them
 * against app.json and global.css). Each is the font's PostScript name and file name.
 */
export const FONT = {
  display: "BricolageGrotesque-ExtraBold",
  displayBold: "BricolageGrotesque-Bold",
  mono: "JetBrainsMono-Regular",
  monoMedium: "JetBrainsMono-Medium",
} as const;
