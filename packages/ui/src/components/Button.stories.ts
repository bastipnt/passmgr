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
  },
  tags: ["autodocs"],
});

export const Primary = meta.story({
  args: {
    variant: "default",
    children: "LinkButton",
    href: "",
    size: "default",
  },
});

export const Secondary = meta.story({
  args: {
    variant: "secondary",
    children: "LinkButton",
    href: "",
    size: "default",
  },
});
