import preview from "../../.storybook/preview";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./Item";
import { Button } from "./Button";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Atoms/Item",
  component: Item,
  subcomponents: {
    ItemGroup,
    ItemMedia,
    ItemContent,
    ItemTitle,
    ItemDescription,
    ItemActions,
    ItemHeader,
    ItemFooter,
    ItemSeparator,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "muted", "active", "glass", "glass-active"],
    },
    size: { control: "select", options: ["default", "sm", "xs"] },
  },
  args: { variant: "default", size: "default" },
});

export const Default = meta.story({
  render: (args) => (
    <Item {...args} className="w-80">
      <ItemMedia variant="icon">
        <FolderIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Documents</ItemTitle>
        <ItemDescription>12 files</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="icon-sm">
          <ChevronRightIcon />
        </Button>
      </ItemActions>
    </Item>
  ),
});

export const Group = meta.story({
  render: (args) => (
    <ItemGroup className="w-80">
      <Item {...args}>
        <ItemContent>
          <ItemTitle>Item one</ItemTitle>
          <ItemDescription>First entry</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item {...args}>
        <ItemContent>
          <ItemTitle>Item two</ItemTitle>
          <ItemDescription>Second entry</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
});

export const Outline = meta.story({ args: { variant: "outline" } });
export const Muted = meta.story({ args: { variant: "muted" } });
export const Active = meta.story({ args: { variant: "active" } });
