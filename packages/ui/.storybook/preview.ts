import "../src/styles/globals.css";
import { definePreview } from "@storybook/react-vite";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { withThemeByClassName } from "@storybook/addon-themes";

export default definePreview({
  // 👇 Add your addons here
  addons: [addonA11y(), addonDocs()],
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
  initialGlobals: {
    theme: "light",
  },
  parameters: {
    a11y: {
      options: { xpath: true },
    },
    docs: {
      // theme: { appBg: "var(--color-surface-1)" },
    },
  },
});
