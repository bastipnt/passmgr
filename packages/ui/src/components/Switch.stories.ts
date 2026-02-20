import preview from "../../.storybook/preview";
import { Switch } from "./Switch";

const meta = preview.meta({
  title: "Design System/Atoms/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    className: "bg-black",
  },
});

export const Default = meta.story({
  args: {},
});
