import { createElement, type ReactNode } from "react";
import preview from "../../.storybook/preview";
import { Separator } from "./Separator";

const wrap = (children: ReactNode) =>
  createElement("div", { className: "flex h-24 w-64 items-center justify-center gap-3" }, children);

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
  decorators: [(Story) => wrap(createElement(Story))],
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
