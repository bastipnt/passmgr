import preview from "../../.storybook/preview";
import { Meter } from "./Meter";

const meta = preview.meta({
  title: "Design System/Atoms/Meter",
  component: Meter,
  args: { value: 72, "aria-label": "Score", className: "w-64" },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({});

export const Success = meta.story({ args: { value: 92, indicatorClassName: "bg-success" } });

export const Destructive = meta.story({
  args: { value: 30, indicatorClassName: "bg-destructive" },
});
