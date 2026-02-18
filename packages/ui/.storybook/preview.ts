import "../src/index.css";
import { definePreview } from "@storybook/react-vite";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";

export default definePreview({
  // 👇 Add your addons here
  addons: [addonA11y(), addonDocs()],
  parameters: {
    backgrounds: {
      options: {
        dark: { name: "Dark", value: "var(--color-surface-1)" },
        light: { name: "Light", value: "var(--color-primary-500)" },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    initialGlobals: {
      // 👇 Set the initial background color
      backgrounds: { value: "dark" },
    },
    a11y: {
      options: { xpath: true },
    },
    docs: {
      // theme: { appBg: "var(--color-surface-1)" },
    },
  },
});
