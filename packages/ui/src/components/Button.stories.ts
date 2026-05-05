import preview from "../../.storybook/preview";

import { Button } from "./Button";

const meta = preview.meta({
  title: "Design System/Atoms/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  args: {
    variant: "default",
    size: "default",
    children: "Button",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
    disabled: { control: "boolean" },
  },
  tags: ["autodocs"],
});

export const Default = meta.story({});

export const Outline = meta.story({ args: { variant: "outline" } });

export const Secondary = meta.story({ args: { variant: "secondary" } });

export const Ghost = meta.story({ args: { variant: "ghost" } });

export const Destructive = meta.story({ args: { variant: "destructive" } });

export const Link = meta.story({ args: { variant: "link" } });

export const Small = meta.story({ args: { size: "sm" } });

export const Large = meta.story({ args: { size: "lg" } });

export const Disabled = meta.story({ args: { disabled: true } });
