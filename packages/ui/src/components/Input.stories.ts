import preview from "../../.storybook/preview";
import { Input } from "./Input";

const meta = preview.meta({
  title: "Design System/Atoms/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
});

export const Default = meta.story({
  args: {
    value: "Hello",
  },
});
