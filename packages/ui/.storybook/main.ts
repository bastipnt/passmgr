import { defineMain } from "@storybook/react-vite/node";
import { dirname } from "path";
import { fileURLToPath } from "url";

// Storybook needs absolute addon paths in a monorepo.
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

export default defineMain({
  stories: ["../src/stories/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  staticDirs: ["../src/assets"],
  addons: [
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-vitest"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-themes"),
  ],
  framework: getAbsolutePath("@storybook/react-vite"),
});
