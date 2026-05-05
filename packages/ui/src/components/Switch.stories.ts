import preview from "../../.storybook/preview";
import { Switch } from "./Switch";

const meta = preview.meta({
  title: "Design System/Atoms/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
    disabled: { control: "boolean" },
  },
  args: {
    size: "default",
  },
});

export const Default = meta.story({});

export const Checked = meta.story({ args: { defaultChecked: true } });

export const Small = meta.story({ args: { size: "sm" } });

export const Disabled = meta.story({ args: { disabled: true } });
