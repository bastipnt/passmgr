import preview from "../../.storybook/preview";
import { Separator } from "./Separator";

const meta = preview.meta({
  title: "Design System/Atoms/Separator",
  component: Separator,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    orientation: "horizontal",
    decorative: true,
  },
});

export const Default = meta.story({
  args: {
    orientation: "horizontal",
    decorative: true,
  },
});

export const Vertical = meta.story({
  args: {
    orientation: "vertical",
  },
});
