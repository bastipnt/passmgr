import preview from "../../.storybook/preview";
import { Label } from "./Label";

const meta = preview.meta({
  title: "Design System/Atoms/Label",
  component: Label,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
});

export const Default = meta.story({
  args: {
    children: "A Label",
  },
});
