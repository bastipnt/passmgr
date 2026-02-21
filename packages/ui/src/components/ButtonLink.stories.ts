import preview from "../../.storybook/preview";

import Link from "./Link";

const meta = preview.meta({
  title: "Design System/Atoms/Link",
  component: Link,
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
