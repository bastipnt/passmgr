// import type { StorybookConfig } from "@storybook/react-vite";

import { defineMain } from "@storybook/react-vite/node";
import { dirname } from "path";
import { fileURLToPath } from "url";

// /**
//  * This function is used to resolve the absolute path of a package.
//  * It is needed in projects that use Yarn PnP or are set up within a monorepo.
//  */
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
// const config: StorybookConfig = {
//   stories: [
//     // "../src/**/*.mdx",
//     // "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
//     "../../../packages/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
//   ],
//   addons: [
//     getAbsolutePath("@chromatic-com/storybook"),
//     getAbsolutePath("@storybook/addon-vitest"),
//     getAbsolutePath("@storybook/addon-a11y"),
//     getAbsolutePath("@storybook/addon-docs"),
//   ],
//   framework: getAbsolutePath("@storybook/react-vite"),
// };
// export default config;

export default defineMain({
  stories: [
    "../src/stories/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    // "../../../packages/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    // "../../../packages/ui/src/stories/**/*.mdx",
  ],
  addons: [
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-vitest"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
  ],
  framework: getAbsolutePath("@storybook/react-vite"),

  // framework: "@storybook/your-framework",
  // stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  // addons: ["@storybook/addon-a11y"],
});
