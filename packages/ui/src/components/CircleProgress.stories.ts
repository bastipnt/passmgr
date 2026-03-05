import preview from "../../.storybook/preview";
import { CircleProgress } from "./CircleProgress";

const meta = preview.meta({
  title: "Design System/Atoms/CircleProgress",
  component: CircleProgress,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
});

export const Default = meta.story({
  args: {
    progress: 40,
    children: 40,
    size: "default",
  },
});

export const XtraSmall = meta.story({
  args: {
    progress: 40,
    children: 40,
    size: "xs",
  },
});
export const Small = meta.story({
  args: {
    progress: 40,
    children: 40,
    size: "sm",
  },
});
export const Large = meta.story({
  args: {
    progress: 40,
    children: 40,
    size: "xl",
  },
});
