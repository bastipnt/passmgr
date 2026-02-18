import preview from "../.storybook/preview";

import ButtonLink from "./ButtonLink";

const meta = preview.meta({
  title: "Design System/Atoms/ButtonLink",
  component: ButtonLink,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
});

export const Primary = meta.story({
  args: {
    variant: "primary",
    children: "LinkButton",
    href: "",
  },
});
