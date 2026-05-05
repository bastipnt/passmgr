import preview from "../../.storybook/preview";
import { Textarea } from "./Textarea";

const meta = preview.meta({
  title: "Design System/Atoms/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
  },
});

export const Default = meta.story({
  args: { placeholder: "Type your message..." },
});

export const WithValue = meta.story({
  args: { defaultValue: "Hello there." },
});

export const Invalid = meta.story({
  args: { defaultValue: "oops", "aria-invalid": true },
});

export const Disabled = meta.story({
  args: { defaultValue: "Disabled", disabled: true },
});
