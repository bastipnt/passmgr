import { ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import preview from "../../.storybook/preview";
import { ThemeToggle } from "./ThemeToggle";

const meta = preview.meta({
  title: "Design System/Complex/ThemeToggle",
  component: ThemeToggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ThemeProvider defaultTheme="dark" storageKey="storybook-theme">
        <Story />
      </ThemeProvider>
    ),
  ],
});

export const Default = meta.story({});
