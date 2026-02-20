import {
  ItemDisplay,
  ItemDisplayGroup,
  itemDisplayVariants,
} from "@repo/ui/complex-components/ItemDisplay";
import preview from "../../.storybook/preview";
import { CircleProgress } from "@repo/ui/components/CircleProgress";

const meta = preview.meta({
  title: "Design System/Item Display",
  component: ItemDisplay,
  subcomponents: {
    ItemDisplayGroup,
  },
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    title: {
      control: "text",
    },
    value: {
      control: "text",
    },
    variant: {
      control: "select",
      options: itemDisplayVariants,
      type: "string",
    },
  },
  args: {
    title: "Username",
    value: "tia@example.com",
    onClick: () => {},
  },
});

export const Default = meta.story({
  render: (args) => (
    <ItemDisplayGroup>
      <ItemDisplay {...args} />
    </ItemDisplayGroup>
  ),
});

export const Password = meta.story({
  render: (args) => (
    <ItemDisplayGroup>
      <ItemDisplay {...args} variant="password" />
    </ItemDisplayGroup>
  ),
});

export const Hidden = meta.story({
  render: (args) => (
    <ItemDisplayGroup>
      <ItemDisplay {...args} variant="hidden" />
    </ItemDisplayGroup>
  ),
});

export const TOTP = meta.story({
  render: (args) => (
    <ItemDisplayGroup>
      <ItemDisplay
        {...args}
        actions={<CircleProgress progress={(100 / 60) * 27}>27</CircleProgress>}
      />
    </ItemDisplayGroup>
  ),
});
