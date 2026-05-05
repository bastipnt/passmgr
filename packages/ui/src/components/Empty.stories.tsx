import preview from "../../.storybook/preview";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./Empty";
import { Button } from "./Button";
import { InboxIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Atoms/Empty",
  component: Empty,
  subcomponents: { EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({
  render: () => (
    <Empty className="w-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>No items yet</EmptyTitle>
        <EmptyDescription>Get started by adding your first entry.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Add entry</Button>
      </EmptyContent>
    </Empty>
  ),
});
