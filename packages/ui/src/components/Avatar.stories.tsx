import preview from "../../.storybook/preview";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./Avatar";

const meta = preview.meta({
  title: "Design System/Atoms/Avatar",
  component: Avatar,
  subcomponents: { AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "default", "lg"] },
  },
  args: { size: "default" },
});

export const WithImage = meta.story({
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>SC</AvatarFallback>
    </Avatar>
  ),
});

export const Fallback = meta.story({
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>BL</AvatarFallback>
    </Avatar>
  ),
});

export const WithBadge = meta.story({
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>BL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  ),
});

export const Group = meta.story({
  render: (args) => (
    <AvatarGroup>
      <Avatar {...args}>
        <AvatarFallback>A</AvatarFallback>
      </Avatar>
      <Avatar {...args}>
        <AvatarFallback>B</AvatarFallback>
      </Avatar>
      <Avatar {...args}>
        <AvatarFallback>C</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  ),
});
