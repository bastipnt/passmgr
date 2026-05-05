import preview from "../../.storybook/preview";
import { Badge } from "./Badge";

const meta = preview.meta({
  title: "Design System/Atoms/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
  args: { variant: "default", children: "Badge" },
});

export const Default = meta.story({});
export const Secondary = meta.story({ args: { variant: "secondary" } });
export const Destructive = meta.story({ args: { variant: "destructive" } });
export const Outline = meta.story({ args: { variant: "outline" } });
export const Ghost = meta.story({ args: { variant: "ghost" } });
