import preview from "../../.storybook/preview";
import { Slider } from "./Slider";

const meta = preview.meta({
  title: "Design System/Atoms/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    min: { control: "number" },
    max: { control: "number" },
    step: { control: "number" },
    disabled: { control: "boolean" },
    orientation: { control: "select", options: ["horizontal", "vertical"] },
  },
  args: {
    min: 0,
    max: 100,
    step: 1,
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({ args: { defaultValue: [50] } });

export const Range = meta.story({ args: { defaultValue: [25, 75] } });

export const Stepped = meta.story({
  args: { defaultValue: [40], step: 10, min: 0, max: 100 },
});

export const Disabled = meta.story({ args: { defaultValue: [50], disabled: true } });

export const Vertical = meta.story({
  args: { defaultValue: [50], orientation: "vertical" },
  decorators: [
    (Story) => (
      <div className="h-60">
        <Story />
      </div>
    ),
  ],
});
