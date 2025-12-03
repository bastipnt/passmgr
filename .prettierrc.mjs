/**
 * @type {import("prettier").Config}
 */
const config = {
  useTabs: false,
  tabWidth: 2,
  printWidth: 100,
  endOfLine: "lf",
  plugins: [
    "@prettier/plugin-oxc",
    "prettier-plugin-organize-imports",
    "prettier-plugin-tailwindcss",
  ],
};

export default config;
