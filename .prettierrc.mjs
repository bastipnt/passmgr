/**
 * @type {import("prettier").Config}
 */
const config = {
  useTabs: false,
  tabWidth: 2,
  printWidth: 100,
  endOfLine: "lf",
  plugins: [
    "prettier-plugin-css-order",
    "@prettier/plugin-oxc",
    "prettier-plugin-organize-imports",
  ],
};

export default config;
